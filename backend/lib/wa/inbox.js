// The team Inbox (/whatsappbot → Inbox): every chat on +91 70666 46667, replies, notes, assigning,
// open / resolved, quick replies, and what we know about the customer beside the chat.
//
// A free-text reply is only possible within 24 hours of the customer's last message (WhatsApp's rule);
// after that the chat needs an approved template. A person replying pauses the bot in that chat.
import { query as defaultQuery } from '../db.js'
import { httpError, str, formatInr } from '../sales/util.js'
import { whatsappNumber } from '../whatsapp.js'
import { sendMessage, uploadMedia, graph, PHONE_ID } from './cloud.js'
import { getBot } from './bot.js'
import { sendTemplate } from './admin.js'
import { last10 } from './contacts.js'

const WINDOW_MS = 24 * 3600e3

export async function listChats(f = {}, staff, { query = defaultQuery } = {}) {
  const params = []
  const w = []
  const add = (sql, v) => { params.push(v); w.push(sql.replaceAll('$?', '$' + params.length)) }
  if (f.status === 'open' || f.status === 'resolved') add(`coalesce(c.status, 'open') = $?`, f.status)
  if (f.view === 'mine') add(`c.assigned_to = $?`, staff.id)
  if (f.view === 'unassigned') w.push('c.assigned_to is null')
  if (f.view === 'unread') w.push('coalesce(u.n, 0) > 0')
  if (str(f.q)) add(`(l.phone like $? or lower(coalesce(c.name, '')) like $?)`, '%' + str(f.q).toLowerCase() + '%')
  if (str(f.tag)) add(`$? = any(c.tags)`, str(f.tag).toLowerCase())
  const { rows } = await query(
    `with l as (
       select distinct on (phone) phone, body, direction, created_at, status from wa_messages order by phone, created_at desc
     ), lastin as (
       select phone, max(created_at) as at from wa_messages where direction = 'in' group by phone
     ), u as (
       select m.phone, count(*)::int as n from wa_messages m left join wa_contacts c on c.phone = m.phone
        where m.direction = 'in' and m.created_at > coalesce(c.last_read_at, 'epoch'::timestamptz) group by m.phone
     )
     select l.phone, l.body, l.direction, l.created_at, l.status as last_status, lastin.at as last_in_at,
            coalesce(c.name, (select payload->>'profileName' from wa_messages x where x.phone = l.phone and x.direction = 'in' and payload ? 'profileName' order by created_at desc limit 1)) as name,
            coalesce(c.status, 'open') as chat_status, c.assigned_to, s.full_name as assigned_name, coalesce(c.tags, '{}') as tags,
            coalesce(u.n, 0) as unread, c.opted_out_at
       from l left join lastin on lastin.phone = l.phone left join wa_contacts c on c.phone = l.phone
       left join u on u.phone = l.phone left join staff_users s on s.id = c.assigned_to
       ${w.length ? 'where ' + w.join(' and ') : ''}
      order by l.created_at desc limit 200`, params)
  const { rows: [t] } = await query(
    `select count(*) filter (where coalesce(c.status, 'open') = 'open')::int as open,
            count(*) filter (where c.assigned_to = $1 and coalesce(c.status, 'open') = 'open')::int as mine,
            count(*) filter (where c.assigned_to is null and coalesce(c.status, 'open') = 'open')::int as unassigned
       from (select distinct phone from wa_messages) p left join wa_contacts c on c.phone = p.phone`, [staff.id])
  return {
    chats: rows.map((r) => ({
      phone: r.phone, name: r.name, last: r.body, lastDirection: r.direction, lastAt: r.created_at, lastStatus: r.last_status,
      windowOpen: Boolean(r.last_in_at && Date.now() - new Date(r.last_in_at).getTime() < WINDOW_MS),
      status: r.chat_status, assignedTo: r.assigned_to, assignedName: r.assigned_name, tags: r.tags, unread: r.unread, optedOut: Boolean(r.opted_out_at),
    })),
    counts: t,
  }
}

/** One chat: messages, notes and the customer panel. Marks it read (and sends Meta a read receipt). */
export async function getChat(phone, staff, { query = defaultQuery, fetchImpl, money = true } = {}) {
  const p = str(phone)
  const [{ rows: messages }, { rows: notes }, { rows: [c] }, { rows: orders }, { rows: [spin] }, { rows: [ref] }, { rows: [bot] }, { rows: staffList }] = await Promise.all([
    query(`select id, wamid, direction, kind, template_name, body, status, error, source, staff_id, created_at, payload->>'profileName' as profile_name,
                  coalesce(payload->'image'->>'id', payload->'document'->>'id', payload->'sticker'->>'id') as media_id
             from wa_messages where phone = $1 order by created_at desc limit 300`, [p]),
    query(`select n.id, n.body, n.created_at, s.full_name from wa_notes n left join staff_users s on s.id = n.staff_id where n.phone = $1 order by n.created_at desc limit 50`, [p]),
    query(`select c.*, s.full_name as assigned_name from wa_contacts c left join staff_users s on s.id = c.assigned_to where c.phone = $1`, [p]),
    query(`select order_number, status, total_paise, placed_at, delivered_at, shipping_address->>'city' as city
             from orders where right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1 and status <> 'pending_payment'
            order by placed_at desc nulls last limit 5`, [last10(p)]),
    query(`select sp.prize_label, d.code, d.expires_at,
                  exists (select 1 from orders x where x.discount_code_id = d.id and x.status not in ('pending_payment', 'cancelled')) as used
             from spins sp left join discount_codes d on d.id = sp.code_id where sp.phone = $1`, [last10(p)]),
    query(`select d.code from referrers r join discount_codes d on d.id = r.code_id where r.phone = $1`, [last10(p)]),
    query(`select paused_until from wa_bot_state where phone = $1`, [p]).catch(() => ({ rows: [] })),
    query(`select id, full_name, email from staff_users where is_active and role in ('owner', 'admin', 'it', 'sales') order by full_name`),
  ])
  const lastIn = messages.find((m) => m.direction === 'in')
  // Read: our marker, and the blue ticks for the customer on their last message.
  await query(`insert into wa_contacts (phone, last_read_at) values ($1, now()) on conflict (phone) do update set last_read_at = now()`, [p])
  if (lastIn?.wamid && (!c?.last_read_at || new Date(lastIn.created_at) > new Date(c.last_read_at))) {
    graph(`/${PHONE_ID()}/messages`, { method: 'POST', fetchImpl, body: { messaging_product: 'whatsapp', status: 'read', message_id: lastIn.wamid } }).catch(() => {})
  }
  return {
    phone: p,
    name: c?.name || lastIn?.profile_name || null,
    windowOpen: Boolean(lastIn && Date.now() - new Date(lastIn.created_at).getTime() < WINDOW_MS),
    windowEndsAt: lastIn ? new Date(new Date(lastIn.created_at).getTime() + WINDOW_MS) : null,
    status: c?.status || 'open', assignedTo: c?.assigned_to || null, assignedName: c?.assigned_name || null,
    tags: c?.tags || [], optedInAt: c?.opted_in_at || null, optedOutAt: c?.opted_out_at || null,
    botPausedUntil: bot?.paused_until && new Date(bot.paused_until) > new Date() ? bot.paused_until : null,
    messages: messages.reverse().map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, mediaId: m.media_id, template: m.template_name, body: m.body, status: m.status, error: m.error, source: m.source, at: m.created_at })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, at: n.created_at, by: n.full_name })),
    customer: {
      orders: orders.map((o) => ({ number: o.order_number, status: o.status, total: money ? formatInr(o.total_paise) : null, at: o.placed_at, city: o.city })),
      spin: spin ? { prize: spin.prize_label, code: spin.code, expiresAt: spin.expires_at, used: spin.used } : null,
      referralCode: ref?.code || null,
    },
    staff: staffList.map((s) => ({ id: s.id, name: s.full_name || s.email })),
  }
}

async function pauseBot(phone, query) {
  const bot = await getBot(query)
  await query(
    `insert into wa_bot_state (phone, paused_until, updated_at) values ($1, now() + make_interval(hours => $2::int), now())
     on conflict (phone) do update set paused_until = now() + make_interval(hours => $2::int), awaiting = null, updated_at = now()`,
    [phone, bot.handoffHours]).catch(() => {})
}

/** A free-text reply from the team (inside the 24-hour window). */
export async function replyText(phone, text, staff, { query = defaultQuery, fetchImpl } = {}) {
  const body = String(text || '').trim()
  if (!body) throw httpError('Empty', { publicMessage: 'Type a message.' })
  if (body.length > 4096) throw httpError('Too long', { publicMessage: 'A message can be 4,096 characters at most.' })
  const p = str(phone)
  const { rows: [lastIn] } = await query(`select created_at from wa_messages where phone = $1 and direction = 'in' order by created_at desc limit 1`, [p])
  if (!lastIn || Date.now() - new Date(lastIn.created_at).getTime() >= WINDOW_MS) {
    throw httpError('Window closed', { publicMessage: 'More than 24 hours since the customer last wrote: WhatsApp allows only an approved template now.' })
  }
  const to = whatsappNumber(p) || p.replace(/\D/g, '')
  const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body, preview_url: true } }
  const wamid = await sendMessage(message, { fetchImpl })
  await query(
    `insert into wa_messages (wamid, direction, phone, kind, body, payload, status, source, staff_id, category)
     values ($1, 'out', $2, 'text', $3, $4, 'sent', 'inbox', $5, 'service')`, [wamid, p, body, JSON.stringify(message), staff?.id || null])
  await query(`insert into wa_contacts (phone, last_out_at, last_read_at) values ($1, now(), now())
               on conflict (phone) do update set last_out_at = now(), last_read_at = now(), updated_at = now()`, [p])
  await pauseBot(p, query)
  return { ok: true, wamid }
}

const MEDIA_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'application/pdf': 'document' }

/** A picture (JPG / PNG, up to 5 MB) or a PDF (up to 16 MB) from the team, with an optional caption (inside the 24-hour window). */
export async function replyMedia(phone, { buffer, mimeType, fileName, caption }, staff, { query = defaultQuery, fetchImpl } = {}) {
  const kind = MEDIA_TYPES[mimeType]
  if (!buffer?.length || !kind) throw httpError('Bad file', { publicMessage: 'Send a JPG or PNG picture, or a PDF.' })
  if (kind === 'image' && buffer.length > 5 * 1024 * 1024) throw httpError('Too big', { publicMessage: 'A picture can be 5 MB at most.' })
  const text = String(caption || '').trim().slice(0, 1024)
  const p = str(phone)
  const { rows: [lastIn] } = await query(`select created_at from wa_messages where phone = $1 and direction = 'in' order by created_at desc limit 1`, [p])
  if (!lastIn || Date.now() - new Date(lastIn.created_at).getTime() >= WINDOW_MS) {
    throw httpError('Window closed', { publicMessage: 'More than 24 hours since the customer last wrote: WhatsApp allows only an approved template now.' })
  }
  const name = String(fileName || (kind === 'image' ? 'picture' : 'document.pdf')).replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'file'
  const id = await uploadMedia(buffer, mimeType, name, { fetchImpl })
  const to = whatsappNumber(p) || p.replace(/\D/g, '')
  const media = kind === 'image' ? { id, ...(text ? { caption: text } : {}) } : { id, filename: name, ...(text ? { caption: text } : {}) }
  const message = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: kind, [kind]: media }
  const wamid = await sendMessage(message, { fetchImpl })
  const body = kind === 'image' ? (text ? `📷 ${text}` : '📷 Photo') : `📄 ${name}${text ? ` · ${text}` : ''}`
  await query(
    `insert into wa_messages (wamid, direction, phone, kind, body, payload, status, source, staff_id, category)
     values ($1, 'out', $2, $3, $4, $5, 'sent', 'inbox', $6, 'service')`, [wamid, p, kind, body, JSON.stringify(message), staff?.id || null])
  await query(`insert into wa_contacts (phone, last_out_at, last_read_at) values ($1, now(), now())
               on conflict (phone) do update set last_out_at = now(), last_read_at = now(), updated_at = now()`, [p])
  await pauseBot(p, query)
  return { ok: true, wamid }
}

/** An approved template from the Inbox (when the 24-hour window has closed, or to start a chat). */
export async function replyTemplate(phone, { templateId, values }, staff, { query = defaultQuery, fetchImpl } = {}) {
  const { rows: [t] } = await query('select * from wa_templates where id = $1', [templateId])
  if (!t || t.status !== 'APPROVED') throw httpError('Not approved', { publicMessage: 'Choose an approved template.' })
  const wamid = await sendTemplate(str(phone), t, values || {}, { source: 'inbox', staff, query, fetchImpl })
  await query(`insert into wa_contacts (phone, last_out_at, last_read_at) values ($1, now(), now())
               on conflict (phone) do update set last_out_at = now(), last_read_at = now(), updated_at = now()`, [last10(phone)])
  await pauseBot(str(phone), query)
  return { ok: true, wamid }
}

export async function updateChat(phone, input, staff, { query = defaultQuery } = {}) {
  const p = str(phone)
  await query(`insert into wa_contacts (phone) values ($1) on conflict (phone) do nothing`, [p])
  if (input.status === 'open' || input.status === 'resolved') await query(`update wa_contacts set status = $2, updated_at = now() where phone = $1`, [p, input.status])
  if (input.assignedTo !== undefined) await query(`update wa_contacts set assigned_to = $2, updated_at = now() where phone = $1`, [p, input.assignedTo || null])
  if (input.name !== undefined) await query(`update wa_contacts set name = $2, updated_at = now() where phone = $1`, [p, str(input.name).slice(0, 80) || null])
  if (input.bot === 'resume') await query(`update wa_bot_state set paused_until = null where phone = $1`, [p]).catch(() => {})
  if (input.bot === 'pause') await pauseBot(p, query)
  return { ok: true }
}

export async function addNote(phone, body, staff, { query = defaultQuery } = {}) {
  const b = String(body || '').trim().slice(0, 2000)
  if (!b) throw httpError('Empty', { publicMessage: 'Write the note.' })
  await query(`insert into wa_notes (phone, staff_id, body) values ($1, $2, $3)`, [str(phone), staff?.id || null, b])
  return { ok: true }
}

export async function listQuickReplies({ query = defaultQuery } = {}) {
  const { rows } = await query(`select id, title, body from wa_quick_replies order by title`)
  return rows
}
export async function saveQuickReply(input, { query = defaultQuery } = {}) {
  const title = str(input.title).slice(0, 40)
  const body = String(input.body || '').trim().slice(0, 4096)
  if (!title || !body) throw httpError('Empty', { publicMessage: 'Give the quick reply a name and a text.' })
  if (input.id) await query(`update wa_quick_replies set title = $2, body = $3 where id = $1`, [input.id, title, body])
  else await query(`insert into wa_quick_replies (title, body) values ($1, $2)`, [title, body])
  return listQuickReplies({ query })
}
export async function deleteQuickReply(id, { query = defaultQuery } = {}) {
  await query(`delete from wa_quick_replies where id = $1`, [id])
  return listQuickReplies({ query })
}
