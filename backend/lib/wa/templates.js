// WhatsApp message templates (/whatsapp → Templates): write them in the dashboard, check them against
// Meta's rules, submit them, and keep Meta's verdict (approved / rejected and why) in wa_templates.
//
// The dashboard edits a simple "model" (header, body, footer, buttons, samples); Meta wants its own
// "components" array. toComponents / fromComponents convert between the two.
import { query as defaultQuery } from '../db.js'
import { httpError, str } from '../sales/util.js'
import { WABA_ID, graph } from './cloud.js'

const SITE = 'https://chennairiceindustries.com'
export const LINK_BASE = `${SITE}/w/{{1}}`
const CATEGORIES = ['MARKETING', 'UTILITY']
const HEADER_FORMATS = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']
const varsIn = (text) => [...String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))

/** Problems that would make Meta refuse the template, in plain words ([] when it is fine). */
export function checkModel(m) {
  const problems = []
  const name = str(m.name)
  if (!/^[a-z0-9_]{1,512}$/.test(name)) problems.push('Name: lowercase letters, numbers and _ only (e.g. spin_reminder).')
  if (!CATEGORIES.includes(m.category)) problems.push('Choose Marketing or Utility.')
  const body = String(m.body?.text || '')
  if (!body.trim()) problems.push('The message (body) is empty.')
  if (body.length > 1024) problems.push(`The message is ${body.length} characters; the limit is 1,024.`)
  const vars = varsIn(body)
  const distinct = [...new Set(vars)].sort((a, b) => a - b)
  if (distinct.some((v, i) => v !== i + 1)) problems.push('Number the {{ }} variables in order: {{1}}, {{2}}, {{3}}…')
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(body)) problems.push('The message cannot start with a {{ }} variable; put a word before it.')
  if (/\{\{\s*\d+\s*\}\}[\s.!?]*$/.test(body)) problems.push('The message cannot end with a {{ }} variable; add a few words after it.')
  if (/\}\}\s*\{\{/.test(body)) problems.push('Two variables cannot sit next to each other; put words between them.')
  const samples = m.body?.samples || []
  distinct.forEach((v) => { if (!str(samples[v - 1])) problems.push(`Give a sample for {{${v}}} (Meta asks for one).`) })

  const h = m.header || { format: 'NONE' }
  if (!HEADER_FORMATS.includes(h.format)) problems.push('Unknown header type.')
  if (h.format === 'TEXT') {
    if (!str(h.text)) problems.push('The header text is empty.')
    if (String(h.text || '').length > 60) problems.push('The header can be 60 characters at most.')
    const hv = varsIn(h.text)
    if (hv.length > 1 || (hv.length && hv[0] !== 1)) problems.push('The header can have one variable, {{1}}.')
    if (hv.length && !str(h.sample)) problems.push('Give a sample for the header {{1}}.')
  }
  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format) && !str(h.handle)) problems.push(`Upload a sample ${h.format.toLowerCase()} for the header.`)

  const footer = String(m.footer || '')
  if (footer.length > 60) problems.push('The footer can be 60 characters at most.')
  if (varsIn(footer).length) problems.push('The footer cannot have variables.')

  const buttons = m.buttons || []
  if (buttons.length > 10) problems.push('At most 10 buttons.')
  const count = (t) => buttons.filter((b) => b.type === t).length
  if (count('URL') > 2) problems.push('At most 2 website buttons.')
  if (count('PHONE_NUMBER') > 1) problems.push('At most 1 call button.')
  if (count('COPY_CODE') > 1) problems.push('At most 1 copy-code button.')
  // Quick replies must sit together (all before or all after the other buttons).
  const kinds = buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'q' : 'o')).join('')
  if (/q+o+q|o+q+o/.test(kinds)) problems.push('Keep the quick-reply buttons together (all first or all last).')
  buttons.forEach((b, i) => {
    const n = `Button ${i + 1}`
    if (b.type !== 'COPY_CODE' && !str(b.text)) problems.push(`${n}: give it a label.`)
    if (String(b.text || '').length > 25) problems.push(`${n}: the label can be 25 characters at most.`)
    if (b.type === 'URL') {
      const url = str(b.url)
      if (!/^https:\/\/\S+$/.test(url)) problems.push(`${n}: the link must start with https://`)
      const uv = varsIn(url)
      if (uv.length > 1 || (uv.length && !/\{\{1\}\}$/.test(url))) problems.push(`${n}: a link can have one variable, {{1}}, at the very end.`)
      if (uv.length && !str(b.sample)) problems.push(`${n}: give a sample for the end of the link (e.g. spin-A745B4).`)
    }
    if (b.type === 'PHONE_NUMBER' && !/^\+\d{8,15}$/.test(str(b.phone))) problems.push(`${n}: the phone number must look like +917066646667.`)
    if (b.type === 'COPY_CODE' && !/^[A-Za-z0-9]{1,15}$/.test(str(b.sample))) problems.push(`${n}: give a sample code of up to 15 letters and numbers only (no - or spaces), e.g. SPINA745B4. Meta refuses anything else.`)
  })
  if (count('COPY_CODE') && m.category !== 'MARKETING') problems.push('A copy-code button is only allowed on Marketing templates.')
  return problems
}

/** The dashboard's model → Meta's components array. */
export function toComponents(m) {
  const out = []
  const h = m.header || { format: 'NONE' }
  if (h.format === 'TEXT') {
    out.push({ type: 'HEADER', format: 'TEXT', text: h.text, ...(varsIn(h.text).length ? { example: { header_text: [h.sample] } } : {}) })
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format)) {
    out.push({ type: 'HEADER', format: h.format, example: { header_handle: [h.handle] } })
  }
  const body = String(m.body.text)
  const n = Math.max(0, ...varsIn(body))
  out.push({ type: 'BODY', text: body, ...(n ? { example: { body_text: [m.body.samples.slice(0, n).map(String)] } } : {}) })
  if (str(m.footer)) out.push({ type: 'FOOTER', text: m.footer })
  if (m.buttons?.length) {
    out.push({
      type: 'BUTTONS',
      buttons: m.buttons.map((b) => {
        if (b.type === 'URL') {
          const dynamic = varsIn(b.url).length > 0
          return { type: 'URL', text: b.text, url: b.url, ...(dynamic ? { example: [b.url.replace(/\{\{1\}\}$/, b.sample)] } : {}) }
        }
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone }
        if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', example: b.sample }
        return { type: 'QUICK_REPLY', text: b.text }
      }),
    })
  }
  return out
}

/** Meta's components array → the dashboard's model. */
export function fromComponents(components = []) {
  const m = { header: { format: 'NONE' }, body: { text: '', samples: [] }, footer: '', buttons: [] }
  for (const c of components) {
    const type = String(c.type || '').toUpperCase()
    if (type === 'HEADER') {
      m.header = c.format === 'TEXT'
        ? { format: 'TEXT', text: c.text || '', sample: c.example?.header_text?.[0] || '' }
        : { format: c.format || 'IMAGE', handle: c.example?.header_handle?.[0] || '' }
    } else if (type === 'BODY') {
      m.body = { text: c.text || '', samples: (c.example?.body_text?.[0] || []).map(String) }
    } else if (type === 'FOOTER') {
      m.footer = c.text || ''
    } else if (type === 'BUTTONS') {
      m.buttons = (c.buttons || []).map((b) => {
        if (b.type === 'URL') {
          const dynamic = /\{\{1\}\}$/.test(b.url || '')
          const sample = dynamic ? String(b.example?.[0] || '').slice(String(b.url).length - 5) : ''
          return { type: 'URL', text: b.text, url: b.url, sample }
        }
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone: b.phone_number }
        if (b.type === 'COPY_CODE') return { type: 'COPY_CODE', text: 'Copy code', sample: String(Array.isArray(b.example) ? b.example[0] ?? '' : b.example ?? '') }
        return { type: 'QUICK_REPLY', text: b.text }
      })
    }
  }
  return m
}

const hasCopyCode = (components) => (components || []).some((c) => c.type === 'BUTTONS' && c.buttons?.some((b) => b.type === 'COPY_CODE'))

function shape(r) {
  return {
    id: r.id, name: r.name, language: r.language, category: r.category, kind: r.kind, status: r.status,
    metaId: r.meta_id, rejectedReason: r.rejected_reason, quality: r.quality, purpose: r.purpose,
    submittedAt: r.submitted_at, syncedAt: r.synced_at, updatedAt: r.updated_at,
    components: r.components, model: { ...fromComponents(r.components), name: r.name, language: r.language, category: r.category, kind: r.kind, purpose: r.purpose || '' },
  }
}

// ---- the 14 ready-made templates, loaded once as drafts ------------------------------------------------------
const link = (text, sample) => ({ type: 'URL', text, url: LINK_BASE, sample })
const copy = (sample) => ({ type: 'COPY_CODE', text: 'Copy code', sample })
const STOP = 'Reply STOP to opt out'
const SIGN = 'Chennai Rice Industries'
const draft = (name, category, purpose, text, samples, { footer = category === 'MARKETING' ? STOP : SIGN, buttons = [] } = {}) =>
  ({ name, category, purpose, kind: buttons.some((b) => b.type === 'COPY_CODE') ? 'coupon' : 'standard', header: { format: 'NONE' }, body: { text, samples }, footer, buttons })

export const STARTER_TEMPLATES = [
  draft('order_placed', 'UTILITY', 'Orders: sent when an order is paid',
    'Hi {{1}}, thank you for your order! 🍚\n\nYour order *#{{2}}* has been placed successfully. You can track it here: {{3}}\n\nQuestions? Just reply to this message.',
    ['Ravi', 'CR10482', 'https://chennairiceindustries.com/track-order']),
  draft('spin_code', 'MARKETING', 'Spin & Win: the prize code right after the spin',
    'Congratulations {{1}}! 🎉 You won *{{2}}* on Chennai Rice Spin & Win.\n\nUse it on orders above {{3}}, valid till *{{4}}*. Order from this mobile number and the code is filled in for you at checkout.',
    ['Ravi', '₹75 OFF', '₹1,000', '10 Dec'], { buttons: [copy('SPINA745B4'), link('Shop now', 'spin-A745B4')] }),
  draft('spin_gift_won', 'MARKETING', 'Spin & Win: the free 5 kg bag prize',
    'Congratulations {{1}}! 🎁 You won a *Free 5 kg Kitchadi Ponni Slogan Bag* on Chennai Rice Spin & Win.\n\nIt comes free with your next order above {{2}}, placed before *{{3}}*. Order from this mobile number and it is added automatically.',
    ['Ravi', '₹1,000', '10 Dec'], { buttons: [link('Shop now', 'spin-A745B4')] }),
  draft('spin_reminder', 'MARKETING', 'Spin & Win: reminder 3 days later if the code is unused',
    'Hi {{1}}, your *{{2}}* from Spin & Win is still waiting for you! 🍚\n\nStock up on Kitchadi Ponni before *{{3}}*. The code is applied automatically when you order from this number.',
    ['Ravi', '₹75 OFF', '10 Dec'], { buttons: [copy('SPINA745B4'), link('Use my offer', 'spin-A745B4')] }),
  draft('spin_last_chance', 'MARKETING', 'Spin & Win: 2 days before the code expires',
    'Last chance, {{1}}! ⏳ Your *{{2}}* ends on *{{3}}*.\n\nAfter that the code cannot be used. Order today and save on your rice.',
    ['Ravi', '₹75 OFF', '10 Dec'], { buttons: [copy('SPINA745B4'), link('Order now', 'spin-A745B4')] }),
  draft('ref_share_code', 'MARKETING', 'Refer a friend: after the first delivery',
    'Hi {{1}}, glad your rice reached you safely! 🙏\n\nShare Chennai Rice with friends: they get *{{2}} off* their first order with your code *{{3}}*, and you get *{{4}}* when their order is delivered.\n\nTap below to share your code.',
    ['Lakshmi', '₹50', 'LAKSHMI47', '₹50'], { buttons: [link('Share my code', 'ref-LAKSHMI47')] }),
  draft('ref_friend_ordered', 'UTILITY', 'Refer a friend: a friend ordered with the code',
    'Good news, {{1}}! 🎉 {{2}} just placed an order using your referral code {{3}}.\n\nYour *{{4}} reward* will be ready as soon as their order is delivered. We will message you then.',
    ['Lakshmi', 'Meena', 'LAKSHMI47', '₹50']),
  draft('ref_reward_ready', 'MARKETING', 'Refer a friend: the reward is ready',
    'Your reward is ready, {{1}}! 🎁\n\nThanks for referring {{2}}: you have earned *{{3}} off* your next order, valid till *{{4}}*. It is applied automatically when you order from this mobile number.',
    ['Lakshmi', 'Meena', '₹50', '9 Jan'], { buttons: [copy('REF7K2M9Q'), link('Use my reward', 'reward-7K2M9Q')] }),
  draft('ref_reward_expiring', 'MARKETING', 'Refer a friend: 7 days before the reward expires',
    'Hi {{1}}, your *{{2}} referral reward* ends on *{{3}}*. ⏳\n\nDo not miss it: it is applied automatically at checkout from this mobile number.',
    ['Lakshmi', '₹50', '9 Jan'], { buttons: [copy('REF7K2M9Q'), link('Order now', 'reward-7K2M9Q')] }),
  draft('ref_nudge', 'MARKETING', 'Refer a friend: a reminder to share (optional)',
    'Hi {{1}}, know someone who loves good rice? 🍚\n\nYour friends get *{{2}} off* their first Chennai Rice order with code *{{3}}*, and you earn *{{4}}* for every friend who orders.',
    ['Lakshmi', '₹50', 'LAKSHMI47', '₹50'], { buttons: [link('Share my code', 'ref-LAKSHMI47')] }),
  draft('restock_reminder', 'MARKETING', 'Retention: time to restock',
    'Hi {{1}}, it has been {{2}} days since your last order of *{{3}}*. Running low? 🍚\n\nReorder in one tap: your usual order is already in the cart.',
    ['Ravi', '22', 'Kitchadi Ponni 5 kg'], { buttons: [link('Reorder now', 'reorder-CR10482')] }),
  draft('winback_offer', 'MARKETING', 'Retention: 60 days without an order',
    'We miss you, {{1}}! 💛\n\nHere is *{{2}} off* your next order of Chennai Rice, valid till *{{3}}*. It is applied automatically when you order from this mobile number.',
    ['Ravi', '₹50', '20 Nov'], { buttons: [copy('BACK4H8P2L'), link('Shop now', 'back-4H8P2L')] }),
  draft('cart_reminder', 'MARKETING', 'Retention: items left in the cart',
    'Hi {{1}}, you left *{{2}}* in your cart. 🛒\n\nYour items are saved. Complete your order in one tap before they sell out.',
    ['Ravi', 'Kitchadi Ponni 26 kg and 1 more'], { buttons: [link('Complete my order', 'cart-9f3k2a')] }),
  draft('review_request', 'UTILITY', 'Orders: review 2 days after delivery',
    'Hi {{1}}, your order *#{{2}}* was delivered. We hope you enjoy it! 🍚\n\nHow was the rice? Your review takes 30 seconds and helps other families choose.',
    ['Ravi', 'CR10482'], { buttons: [link('Write a review', 'review-CR10482')] }),
]

async function seedOnce(query) {
  const { rowCount } = await query(
    `insert into company_settings (key, value) values ('wa_templates_seeded', 'true') on conflict (key) do nothing`)
  if (!rowCount) return
  for (const t of STARTER_TEMPLATES) {
    await query(
      `insert into wa_templates (name, language, category, kind, components, purpose) values ($1, 'en', $2, $3, $4, $5)
       on conflict (name, language) do nothing`,
      [t.name, t.category, t.kind, JSON.stringify(toComponents(t)), t.purpose])
  }
}

// ---- reading, saving, submitting --------------------------------------------------------------------------------
export async function listTemplates({ query = defaultQuery } = {}) {
  await seedOnce(query)
  const { rows } = await query(`select * from wa_templates order by (status = 'DRAFT') desc, updated_at desc`)
  const counts = {}
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1
  return { templates: rows.map(shape), counts }
}

function cleanModel(input) {
  const m = {
    name: str(input.name).toLowerCase().replace(/[\s-]+/g, '_'),
    language: str(input.language) || 'en',
    category: str(input.category).toUpperCase(),
    purpose: str(input.purpose).slice(0, 200),
    header: input.header?.format ? { format: input.header.format, text: input.header.text || '', sample: input.header.sample || '', handle: input.header.handle || '' } : { format: 'NONE' },
    body: { text: String(input.body?.text || '').replace(/\r\n/g, '\n'), samples: (input.body?.samples || []).map((s) => str(s)) },
    footer: str(input.footer),
    buttons: (input.buttons || []).slice(0, 10).map((b) => ({ type: b.type, text: str(b.text), url: str(b.url), sample: str(b.sample), phone: str(b.phone) })),
  }
  m.kind = m.buttons.some((b) => b.type === 'COPY_CODE') ? 'coupon' : 'standard'
  return m
}

/** Saves a draft (new, or an existing draft / rejected template being fixed). Approved ones are copied instead. */
export async function saveTemplate(input, staff, { query = defaultQuery } = {}) {
  const m = cleanModel(input)
  if (!/^[a-z0-9_]{1,512}$/.test(m.name)) throw httpError('Bad name', { publicMessage: 'Name: lowercase letters, numbers and _ only (e.g. spin_reminder).' })
  if (!CATEGORIES.includes(m.category)) throw httpError('Bad category', { publicMessage: 'Choose Marketing or Utility.' })
  const components = JSON.stringify(toComponents({ ...m, body: { ...m.body, samples: m.body.samples } }))
  if (input.id) {
    const { rows: [cur] } = await query('select * from wa_templates where id = $1', [input.id])
    if (!cur) throw httpError('No template', { status: 404, publicMessage: 'That template is gone.' })
    if (['PENDING', 'APPROVED', 'IN_APPEAL'].includes(cur.status) && cur.name !== m.name) {
      throw httpError('Rename', { publicMessage: 'A submitted template cannot be renamed. Duplicate it instead.' })
    }
    const { rows: [r] } = await query(
      `update wa_templates set name = $2, language = $3, category = $4, kind = $5, components = $6, purpose = $7, updated_at = now()
       where id = $1 returning *`, [input.id, m.name, m.language, m.category, m.kind, components, m.purpose])
    return shape(r)
  }
  const { rows: [r] } = await query(
    `insert into wa_templates (name, language, category, kind, components, purpose, created_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (name, language) do nothing returning *`,
    [m.name, m.language, m.category, m.kind, components, m.purpose, staff?.id || null])
  if (!r) throw httpError('Duplicate', { status: 409, publicMessage: `There is already a template called ${m.name}.` })
  return shape(r)
}

export async function duplicateTemplate(id, staff, { query = defaultQuery } = {}) {
  const { rows: [cur] } = await query('select * from wa_templates where id = $1', [id])
  if (!cur) throw httpError('No template', { status: 404, publicMessage: 'That template is gone.' })
  for (let i = 2; i < 50; i++) {
    const name = `${cur.name.replace(/_v\d+$/, '')}_v${i}`.slice(0, 512)
    const { rows: [r] } = await query(
      `insert into wa_templates (name, language, category, kind, components, purpose, created_by) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (name, language) do nothing returning *`,
      [name, cur.language, cur.category, cur.kind, JSON.stringify(cur.components), cur.purpose, staff?.id || null])
    if (r) return shape(r)
  }
  throw httpError('Too many copies', { publicMessage: 'Too many copies of this template.' })
}

/** Sends a draft (or a rejected template, fixed) to Meta for approval. */
export async function submitTemplate(id, { query = defaultQuery, fetchImpl } = {}) {
  const { rows: [t] } = await query('select * from wa_templates where id = $1', [id])
  if (!t) throw httpError('No template', { status: 404, publicMessage: 'That template is gone.' })
  const model = { ...fromComponents(t.components), name: t.name, category: t.category }
  const problems = checkModel(model)
  if (problems.length) throw httpError('Invalid template', { publicMessage: 'Fix these first: ' + problems.join(' ') })
  let data
  if (t.meta_id && ['REJECTED', 'PAUSED', 'APPROVED'].includes(t.status)) {
    // Editing one Meta already knows (a fix after a rejection, or a change to an approved one).
    data = await graph(`/${t.meta_id}`, { method: 'POST', fetchImpl, body: { category: t.category, components: t.components } })
    data = { id: t.meta_id, status: 'PENDING', ...data }
  } else {
    data = await graph(`/${WABA_ID()}/message_templates`, {
      method: 'POST', fetchImpl,
      body: { name: t.name, language: t.language, category: t.category, components: t.components },
    })
  }
  const { rows: [r] } = await query(
    `update wa_templates set meta_id = $2, status = $3, category = coalesce($4, category), rejected_reason = null,
            submitted_at = now(), updated_at = now() where id = $1 returning *`,
    [id, String(data.id || t.meta_id || ''), String(data.status || 'PENDING').toUpperCase(), data.category ? String(data.category).toUpperCase() : null])
  return shape(r)
}

/** Deletes a template: from Meta too when it was submitted. */
export async function deleteTemplate(id, { query = defaultQuery, fetchImpl } = {}) {
  const { rows: [t] } = await query('select * from wa_templates where id = $1', [id])
  if (!t) return { ok: true }
  if (t.meta_id) {
    await graph(`/${WABA_ID()}/message_templates`, { method: 'DELETE', fetchImpl, query: { name: t.name, hsm_id: t.meta_id } })
  }
  await query('delete from wa_templates where id = $1', [id])
  return { ok: true }
}

/** Reads every template in the WhatsApp Business Account from Meta and updates ours (status, reason, quality). */
export async function syncTemplates({ query = defaultQuery, fetchImpl } = {}) {
  let next = `/${WABA_ID()}/message_templates`
  let params = { fields: 'id,name,language,status,category,components,rejected_reason,quality_score', limit: 100 }
  let seen = 0
  for (let page = 0; next && page < 20; page++) {
    const data = await graph(next, { fetchImpl, query: params })
    for (const t of data.data || []) {
      seen++
      const status = String(t.status || '').toUpperCase()
      const reason = t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null
      await query(
        `insert into wa_templates (name, language, category, kind, components, status, meta_id, rejected_reason, quality, synced_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         on conflict (name, language) do update set category = excluded.category, kind = excluded.kind, components = excluded.components,
           status = excluded.status, meta_id = excluded.meta_id, rejected_reason = excluded.rejected_reason, quality = excluded.quality,
           synced_at = now(), updated_at = now()`,
        [t.name, t.language, String(t.category || 'MARKETING').toUpperCase(), hasCopyCode(t.components) ? 'coupon' : 'standard',
          JSON.stringify(t.components || []), status, String(t.id), reason, t.quality_score?.score || null])
    }
    next = data.paging?.next || null
    params = undefined // the next link already carries them
  }
  return { synced: seen }
}

/** Meta's webhook about a template: approved, rejected (with why), paused, quality or category changed. */
export async function templateEvent(field, v, { query = defaultQuery } = {}) {
  const id = v.message_template_id != null ? String(v.message_template_id) : null
  const where = `where (meta_id = $1 and $1 is not null) or (name = $2 and language = coalesce($3, language))`
  const args = [id, v.message_template_name || '', v.message_template_language || null]
  if (field === 'message_template_status_update') {
    const reason = v.reason && v.reason !== 'NONE' ? String(v.reason) : null
    await query(`update wa_templates set status = $4, rejected_reason = $5, meta_id = coalesce(meta_id, $1), updated_at = now() ${where}`,
      [...args, String(v.event || '').toUpperCase(), reason])
  } else if (field === 'message_template_quality_update') {
    await query(`update wa_templates set quality = $4, updated_at = now() ${where}`, [...args, v.new_quality_score || null])
  } else if (field === 'template_category_update') {
    await query(`update wa_templates set category = $4, updated_at = now() ${where}`, [...args, String(v.new_category || '').toUpperCase()])
  }
}
