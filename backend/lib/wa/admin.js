// /whatsapp dashboard: Overview numbers, Settings (connection, webhook, which route order messages take)
// and sending a template (a test to your own phone now; automations and broadcasts use the same path later).
import { query as defaultQuery } from '../db.js'
import { httpError, str } from '../sales/util.js'
import { whatsappNumber } from '../whatsapp.js'
import { WABA_ID, PHONE_ID, cloudEnabled, accountInfo, webhookSubscribed, subscribeWebhook, sendMessage, graph } from './cloud.js'
import { fromComponents } from './templates.js'

// Rough Meta rates for India in ₹ per delivered message (the dashboard says "approx."; Meta's own figure is shown beside it).
const RATE = { marketing: 0.78, utility: 0.115, authentication: 0.115 }
const IST = "Asia/Kolkata"

/** IST start / end of a period: this_month (default), last_month, last_30, today. */
function period(name) {
  const now = new Date(Date.now() + 5.5 * 3600e3)
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate()
  const ist = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd) - 5.5 * 3600e3)
  if (name === 'today') return { from: ist(y, mo, d), to: ist(y, mo, d + 1) }
  if (name === 'last_30') return { from: ist(y, mo, d - 29), to: ist(y, mo, d + 1) }
  if (name === 'last_month') return { from: ist(y, mo - 1, 1), to: ist(y, mo, 1) }
  return { from: ist(y, mo, 1), to: ist(y, mo, d + 1) }
}

async function metaCost(from, to, { fetchImpl } = {}) {
  try {
    const s = Math.floor(from.getTime() / 1000), e = Math.floor(Math.min(to.getTime(), Date.now()) / 1000)
    const data = await graph(`/${WABA_ID()}`, { fetchImpl, query: { fields: `pricing_analytics.start(${s}).end(${e}).granularity(DAILY)` } })
    const points = (data.pricing_analytics?.data || []).flatMap((d) => d.data_points || [])
    const byCategory = {}
    let cost = 0
    for (const p of points) {
      cost += Number(p.cost) || 0
      const c = String(p.pricing_category || 'other').toLowerCase()
      byCategory[c] = { volume: (byCategory[c]?.volume || 0) + (Number(p.volume) || 0), cost: (byCategory[c]?.cost || 0) + (Number(p.cost) || 0) }
    }
    return { cost: Math.round(cost * 100) / 100, byCategory }
  } catch (err) {
    return { error: err.publicMessage || err.message }
  }
}

export async function overview({ period: p = 'this_month' } = {}, { query = defaultQuery, fetchImpl } = {}) {
  const { from, to } = period(p)
  const [totals, cats, days, tpl, orders, recent, contacts] = await Promise.all([
    query(`select count(*) filter (where direction = 'out')::int as sent,
                  count(*) filter (where direction = 'out' and status in ('delivered', 'read'))::int as delivered,
                  count(*) filter (where direction = 'out' and status = 'read')::int as read,
                  count(*) filter (where direction = 'out' and status = 'failed')::int as failed,
                  count(*) filter (where direction = 'in')::int as received,
                  count(distinct phone) filter (where direction = 'in')::int as customers_in,
                  count(distinct phone) filter (where direction = 'out')::int as customers_out
             from wa_messages where created_at >= $1 and created_at < $2`, [from, to]),
    query(`select coalesce(category, 'unknown') as category, count(*)::int as n
             from wa_messages where direction = 'out' and status in ('delivered', 'read') and coalesce(billable, true)
              and created_at >= $1 and created_at < $2 group by 1`, [from, to]),
    query(`select to_char(d, 'YYYY-MM-DD') as day,
                  count(m.*) filter (where m.direction = 'out')::int as sent,
                  count(m.*) filter (where m.direction = 'out' and m.status = 'read')::int as read,
                  count(m.*) filter (where m.direction = 'in')::int as received
             from generate_series(($1::timestamptz at time zone '${IST}')::date, (($2::timestamptz - interval '1 second') at time zone '${IST}')::date, interval '1 day') d
             left join wa_messages m on (m.created_at at time zone '${IST}')::date = d::date
            group by d order by d`, [from, to]),
    query(`select status, count(*)::int as n from wa_templates group by status`),
    query(`select coalesce(via, 'askeva') as via, status, count(*)::int as n from whatsapp_outbox
            where created_at >= $1 and created_at < $2 group by 1, 2`, [from, to]),
    query(`select id, direction, phone, kind, template_name, body, status, error, source, created_at
             from wa_messages order by created_at desc limit 12`),
    query(`select count(*)::int as all, count(*) filter (where first_message_at >= $1 and first_message_at < $2)::int as new
             from whatsapp_contacts`, [from, to]),
  ])
  const byCategory = Object.fromEntries(cats.rows.map((r) => [r.category, r.n]))
  const approxCost = Object.entries(byCategory).reduce((s, [c, n]) => s + (RATE[c] || 0) * n, 0)
  return {
    period: { name: p, from, to },
    connected: cloudEnabled(),
    totals: totals.rows[0],
    byCategory,
    approxCost: Math.round(approxCost * 100) / 100,
    meta: cloudEnabled() ? await metaCost(from, to, { fetchImpl }) : null,
    days: days.rows,
    templates: Object.fromEntries(tpl.rows.map((r) => [r.status, r.n])),
    orderMessages: orders.rows,
    contacts: contacts.rows[0],
    recent: recent.rows,
  }
}

// ---- settings ------------------------------------------------------------------------------------------------------
export async function orderVia(query = defaultQuery) {
  const { rows: [r] } = await query(`select value from company_settings where key = 'whatsapp_order_via'`).catch(() => ({ rows: [] }))
  return r?.value === 'cloud' ? 'cloud' : 'askeva'
}

export async function settings({ query = defaultQuery, fetchImpl } = {}) {
  const site = (process.env.PUBLIC_SITE_URL || 'https://chennairiceindustries.com').replace(/\/$/, '')
  const out = {
    secrets: { token: cloudEnabled(), appSecret: Boolean(process.env.WHATSAPP_APP_SECRET), verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN) },
    ids: { waba: WABA_ID(), phone: PHONE_ID() },
    webhookUrl: `${site}/api/whatsapp/webhook`,
    orderVia: await orderVia(query),
    askeva: Boolean(process.env.ASKEVA_TOKEN),
    account: null,
    subscribed: null,
  }
  const { rows: [op] } = await query(`select status from wa_templates where name = 'order_placed' and language = 'en'`)
  out.orderTemplate = op?.status || 'MISSING'
  const { rows: [last] } = await query(`select received_at from wa_events order by id desc limit 1`)
  out.lastWebhookAt = last?.received_at || null
  if (cloudEnabled()) {
    out.account = await accountInfo({ fetchImpl })
    out.subscribed = await webhookSubscribed({ fetchImpl }).then((apps) => apps.length > 0).catch(() => null)
  }
  return out
}

export async function saveSettings(input, { query = defaultQuery } = {}) {
  if (input.orderVia !== undefined) {
    const via = input.orderVia === 'cloud' ? 'cloud' : 'askeva'
    if (via === 'cloud') {
      if (!cloudEnabled()) throw httpError('No token', { publicMessage: 'Set WHATSAPP_TOKEN first.' })
      const { rows: [op] } = await query(`select status from wa_templates where name = 'order_placed' and language = 'en'`)
      if (op?.status !== 'APPROVED') {
        throw httpError('Template not approved', { publicMessage: 'The order_placed template must be approved by Meta first (Templates → order_placed → Submit, then Sync).' })
      }
    }
    await query(`insert into company_settings (key, value) values ('whatsapp_order_via', $1)
                 on conflict (key) do update set value = excluded.value, updated_at = now()`, [via])
  }
  return settings({ query })
}

export async function connectWebhook({ fetchImpl } = {}) {
  await subscribeWebhook({ fetchImpl })
  return { subscribed: true }
}

// ---- sending a template -------------------------------------------------------------------------------------------
/**
 * Meta's send parameters for a template from our stored copy: `values.body` fills {{1}}…, `values.header`
 * the header {{1}}, `values.buttons[i]` a website button's {{1}} or a copy-code button's code.
 */
export function sendComponents(model, values = {}) {
  const parts = []
  if (model.header?.format === 'TEXT' && /\{\{1\}\}/.test(model.header.text || '')) {
    parts.push({ type: 'header', parameters: [{ type: 'text', text: String(values.header ?? model.header.sample ?? '') }] })
  }
  const n = Math.max(0, ...[...String(model.body?.text || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))
  if (n) {
    const body = values.body || model.body.samples || []
    parts.push({ type: 'body', parameters: Array.from({ length: n }, (_, i) => ({ type: 'text', text: String(body[i] ?? '') })) })
  }
  ;(model.buttons || []).forEach((b, i) => {
    const v = values.buttons?.[i] ?? b.sample
    if (b.type === 'URL' && /\{\{1\}\}$/.test(b.url || '')) {
      parts.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [{ type: 'text', text: String(v) }] })
    } else if (b.type === 'COPY_CODE') {
      parts.push({ type: 'button', sub_type: 'copy_code', index: String(i), parameters: [{ type: 'coupon_code', coupon_code: String(v) }] })
    }
  })
  return parts
}

/** The message as the customer reads it (for the log). */
export function filledText(model, values = {}) {
  const body = values.body || model.body?.samples || []
  return String(model.body?.text || '').replace(/\{\{(\d+)\}\}/g, (_, d) => String(body[Number(d) - 1] ?? ''))
}

/** Sends an approved template to one number and logs it in wa_messages. Returns Meta's message id. */
export async function sendTemplate(phone, template, values = {}, { source = 'dashboard', staff = null, query = defaultQuery, fetchImpl } = {}) {
  const to = whatsappNumber(phone)
  if (!to) throw httpError('Bad number', { publicMessage: 'Enter a 10-digit Indian mobile number.' })
  const model = fromComponents(template.components)
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(model.header?.format) && !values.headerLink) {
    throw httpError('Header media', { publicMessage: 'This template has a picture/video/PDF header; sending those comes with Broadcasts.' })
  }
  const components = sendComponents(model, values)
  if (values.headerLink) {
    const t = model.header.format.toLowerCase()
    components.unshift({ type: 'header', parameters: [{ type: t, [t]: { link: values.headerLink } }] })
  }
  const message = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
    template: { name: template.name, language: { code: template.language || 'en' }, ...(components.length ? { components } : {}) },
  }
  const wamid = await sendMessage(message, { fetchImpl })
  await query(
    `insert into wa_messages (wamid, direction, phone, kind, template_name, category, body, payload, status, source, staff_id)
     values ($1, 'out', $2, 'template', $3, $4, $5, $6, 'sent', $7, $8) on conflict (wamid) do nothing`,
    [wamid, to.slice(2), template.name, String(template.category || '').toLowerCase() || null, filledText(model, values), JSON.stringify(message), source, staff?.id || null])
  return wamid
}

/** /whatsapp → Templates → "Send test": the template with its sample values, to the given number. */
export async function sendTest({ templateId, phone }, staff, { query = defaultQuery, fetchImpl } = {}) {
  const { rows: [t] } = await query('select * from wa_templates where id = $1', [templateId])
  if (!t) throw httpError('No template', { status: 404, publicMessage: 'That template is gone.' })
  if (t.status !== 'APPROVED') throw httpError('Not approved', { publicMessage: 'Only approved templates can be sent. Submit it and wait for Meta.' })
  const wamid = await sendTemplate(str(phone), t, {}, { source: 'test', staff, query, fetchImpl })
  return { ok: true, wamid }
}

export async function recentMessages({ limit = 50, phone } = {}, { query = defaultQuery } = {}) {
  const { rows } = await query(
    `select id, direction, phone, kind, template_name, category, body, status, error, source, created_at, status_at
       from wa_messages where ($1::text is null or phone = $1) order by created_at desc limit $2`,
    [phone || null, Math.min(Number(limit) || 50, 200)])
  return rows
}
