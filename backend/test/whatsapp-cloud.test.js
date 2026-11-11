// WhatsApp Cloud API (/whatsapp, Nov 2026): template rules, Meta's components both ways, the webhook's
// signature and challenge, and the send parameters. No database or network needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { checkModel, toComponents, fromComponents, STARTER_TEMPLATES } from '../lib/wa/templates.js'
import { verifyChallenge, signatureOk, readable, handleWebhook } from '../lib/wa/webhook.js'
import { sendComponents, filledText } from '../lib/wa/admin.js'
import { templateMessage } from '../lib/wa/cloud.js'

const good = () => ({
  name: 'spin_reminder', category: 'MARKETING',
  header: { format: 'NONE' },
  body: { text: 'Hi {{1}}, your {{2}} is waiting.', samples: ['Ravi', '₹75 OFF'] },
  footer: 'Reply STOP to opt out',
  buttons: [{ type: 'COPY_CODE', sample: 'SPIN-A1' }, { type: 'URL', text: 'Shop now', url: 'https://chennairiceindustries.com/w/{{1}}', sample: 'spin-A1' }],
})

test('all 14 ready-made templates pass Meta\'s rules', () => {
  assert.equal(STARTER_TEMPLATES.length, 14)
  for (const t of STARTER_TEMPLATES) assert.deepEqual(checkModel(t), [], t.name)
})

test('template rules catch what Meta would reject', () => {
  assert.deepEqual(checkModel(good()), [])
  const has = (m, word) => checkModel(m).some((p) => p.includes(word))
  assert.ok(has({ ...good(), name: 'Spin Reminder' }, 'lowercase'))
  assert.ok(has({ ...good(), body: { text: '{{1}} hello', samples: ['a'] } }, 'cannot start'))
  assert.ok(has({ ...good(), body: { text: 'Hello {{1}}', samples: ['a'] } }, 'cannot end'))
  assert.ok(has({ ...good(), body: { text: 'Hi {{1}} {{2}} there', samples: ['a', 'b'] } }, 'next to each other'))
  assert.ok(has({ ...good(), body: { text: 'Hi {{1}} and {{3}} ok', samples: ['a', 'b', 'c'] } }, 'in order'))
  assert.ok(has({ ...good(), body: { text: 'Hi {{1}} ok', samples: [''] } }, 'sample for {{1}}'))
  assert.ok(has({ ...good(), category: 'UTILITY' }, 'copy-code'))
  assert.ok(has({ ...good(), buttons: [{ type: 'URL', text: 'Go', url: 'http://x.com' }] }, 'https'))
  assert.ok(has({ ...good(), buttons: [{ type: 'QUICK_REPLY', text: 'A' }, { type: 'URL', text: 'Go', url: 'https://x.com' }, { type: 'QUICK_REPLY', text: 'B' }] }, 'together'))
  assert.ok(has({ ...good(), footer: 'x'.repeat(61) }, 'footer'))
})

test('the dashboard model goes to Meta\'s components and back unchanged', () => {
  const m = good()
  const c = toComponents(m)
  assert.equal(c.find((x) => x.type === 'BODY').example.body_text[0][1], '₹75 OFF')
  const url = c.find((x) => x.type === 'BUTTONS').buttons[1]
  assert.equal(url.example[0], 'https://chennairiceindustries.com/w/spin-A1')
  const back = fromComponents(c)
  assert.deepEqual(back.body, m.body)
  assert.equal(back.buttons[1].sample, 'spin-A1')
  assert.equal(back.buttons[0].sample, 'SPIN-A1')
  assert.equal(back.footer, m.footer)
})

test('send parameters fill the body, the link ending and the coupon code', () => {
  const parts = sendComponents(good(), { body: ['Meena', '₹50 OFF'], buttons: { 0: 'SPIN-ZZ', 1: 'spin-ZZ' } })
  assert.deepEqual(parts[0].parameters.map((p) => p.text), ['Meena', '₹50 OFF'])
  assert.deepEqual(parts[1], { type: 'button', sub_type: 'copy_code', index: '0', parameters: [{ type: 'coupon_code', coupon_code: 'SPIN-ZZ' }] })
  assert.equal(parts[2].sub_type, 'url')
  assert.equal(parts[2].parameters[0].text, 'spin-ZZ')
  assert.equal(filledText(good(), { body: ['Meena', '₹50 OFF'] }), 'Hi Meena, your ₹50 OFF is waiting.')
  const msg = templateMessage('919876543210', 'order_placed', { params: ['Ravi', 'CR1', 'https://x'] })
  assert.equal(msg.template.components[0].parameters[2].text, 'https://x')
})

test('webhook: Meta\'s one-time check and the signature', () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'phrase123'
  assert.equal(verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'phrase123', 'hub.challenge': '42' }), '42')
  assert.throws(() => verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '42' }))
  const body = Buffer.from('{"entry":[]}')
  const sig = 'sha256=' + crypto.createHmac('sha256', 'shh').update(body).digest('hex')
  assert.equal(signatureOk(body, sig, 'shh'), true)
  assert.equal(signatureOk(body, sig, 'other'), false)
  assert.equal(signatureOk(body, sig, ''), false)
})

test('webhook: messages, statuses and template verdicts reach the database', async () => {
  const calls = []
  const query = async (sql, args) => {
    calls.push({ sql, args })
    return sql.startsWith('insert into wa_events') ? { rows: [{ id: 1 }] } : { rows: [], rowCount: 1 }
  }
  let contacts = 0
  const payload = { entry: [{ changes: [
    { field: 'messages', value: {
      contacts: [{ wa_id: '919876543210', profile: { name: 'Ravi' } }],
      messages: [{ from: '919876543210', id: 'wamid.IN', timestamp: '1700000000', type: 'text', text: { body: 'Where is my order?' } }],
      statuses: [{ id: 'wamid.OUT', status: 'read', timestamp: '1700000001', pricing: { billable: true, category: 'utility' } }],
    } },
    { field: 'message_template_status_update', value: { event: 'REJECTED', message_template_id: 99, message_template_name: 'spin_code', message_template_language: 'en', reason: 'INCORRECT_CATEGORY' } },
  ] }] }
  const r = await handleWebhook(payload, { query, contactsPath: async () => { contacts++ } })
  assert.deepEqual(r, { messages: 1, statuses: 1 })
  assert.equal(contacts, 1)
  const inbound = calls.find((c) => c.sql.includes("'in', $2"))
  assert.equal(inbound.args[1], '9876543210')
  assert.equal(inbound.args[3], 'Where is my order?')
  const status = calls.find((c) => c.sql.startsWith('update wa_messages'))
  assert.equal(status.args[1], 'read')
  const verdict = calls.find((c) => c.sql.startsWith('update wa_templates'))
  assert.deepEqual(verdict.args.slice(3), ['REJECTED', 'INCORRECT_CATEGORY'])
  assert.ok(calls.some((c) => c.sql.includes('set handled = true')))
})

test('readable lines for each kind of incoming message', () => {
  assert.equal(readable({ type: 'button', button: { text: 'Track my order' } }), 'Track my order')
  assert.equal(readable({ type: 'image', image: {} }), '📷 Photo')
  assert.equal(readable({ type: 'interactive', interactive: { list_reply: { title: '5 kg' } } }), '5 kg')
})

// ---- the bot ----
import { DEFAULT_BOT, cleanBot, decide, render, menuMsg } from '../lib/wa/bot.js'

const bot = cleanBot(DEFAULT_BOT)
const deps = {
  findOrder: async (ref, phone) => (ref.orderNumber === 'CR-20261111-AB12C' ? { orderNumber: ref.orderNumber, status: 'shipped', samePhone: phone === '9876543210', trackingUrl: 'https://track.example/1', expected: '14 Nov' } : null),
  offers: async (phone) => (phone === '9876543210' ? [{ code: 'SPIN-A745B4', label: '₹75 off on orders above ₹1,000', until: '10 Dec' }] : []),
  prices: async () => [{ name: 'Kitchadi Ponni', packKg: 5, price: 425, mrp: 480 }],
  delivery: async (pin) => (pin === '600001' ? { delivers: true, region: { name: 'Tamil Nadu' }, charges: [{ packKg: 5, from: 54, to: 54 }] } : { delivers: false }),
}

test('bot: hi gets the welcome menu as a list with every item', async () => {
  for (const t of ['Hi', 'hello!', 'Vanakkam', 'MENU']) assert.equal(decide(bot, { text: t }).kind, 'welcome', t)
  const r = await render(bot, decide(bot, { text: 'hi' }), { name: 'Ravi Kumar' }, deps)
  const m = r.messages[0]
  assert.equal(m.interactive.type, 'list')
  assert.match(m.interactive.body.text, /Vanakkam Ravi!/)
  assert.equal(m.interactive.action.sections[0].rows.length, DEFAULT_BOT.items.length)
  assert.ok(m.interactive.action.sections[0].rows.every((row) => row.title.length <= 24))
})

test('bot: three items or fewer can be buttons', () => {
  const small = cleanBot({ ...DEFAULT_BOT, welcome: { ...DEFAULT_BOT.welcome, style: 'buttons' }, items: DEFAULT_BOT.items.slice(0, 3) })
  const m = menuMsg(small, 'Hi')
  assert.equal(m.interactive.type, 'button')
  assert.equal(m.interactive.action.buttons.length, 3)
  assert.ok(m.interactive.action.buttons.every((b) => b.reply.title.length <= 20))
})

test('bot: menu taps, keywords, order numbers, PIN codes and the fallback', async () => {
  assert.equal(decide(bot, { replyId: 'prices' }).item.id, 'prices')
  assert.equal(decide(bot, { text: 'what is the rate for 26 kg' }).item.id, 'prices')
  assert.equal(decide(bot, { text: 'I want to talk to a person' }).item.id, 'human')
  assert.equal(decide(bot, { text: 'my order CR-20261111-AB12C please' }).kind, 'track')
  assert.equal(decide(bot, { text: '600001' }).kind, 'pincode')
  assert.equal(decide(bot, { text: 'asdf qwerty' }).kind, 'fallback')

  const own = await render(bot, decide(bot, { text: 'CR-20261111-AB12C' }), { phone: '9876543210' }, deps)
  assert.match(own.messages[0].text.body, /on the way/)
  assert.match(own.messages[0].text.body, /track\.example/)
  const other = await render(bot, decide(bot, { text: 'CR-20261111-AB12C' }), { phone: '9000000000' }, deps)
  assert.match(other.messages[0].text.body, /For your privacy/)

  const ask = await render(bot, decide(bot, { replyId: 'track' }), {}, deps)
  assert.equal(ask.state.awaiting, 'order_number')
  const pin = await render(bot, decide(bot, { text: 'my pin is 600001' }, { awaiting: 'pincode', awaiting_at: new Date() }), {}, deps)
  assert.match(pin.messages[0].text.body, /We deliver to 600001/)

  const offers = await render(bot, decide(bot, { replyId: 'offers' }), { phone: '9876543210' }, deps)
  assert.match(offers.messages[0].text.body, /SPIN-A745B4/)
  const prices = await render(bot, decide(bot, { replyId: 'prices' }), {}, deps)
  assert.match(prices.messages[0].text.body, /Kitchadi Ponni 5 kg: \*₹425\*/)
  const hand = await render(bot, decide(bot, { replyId: 'human' }), {}, deps)
  assert.equal(hand.state.pausedHours, 12)
  const fb = await render(bot, decide(bot, { text: 'zzz' }), {}, deps)
  assert.equal(fb.messages[0].interactive.type, 'list')
})

test('webhook: a new customer message is answered by the bot once', async () => {
  const asked = []
  let seen = false
  const query = async (sql) => {
    if (sql.startsWith('insert into wa_events')) return { rows: [{ id: 1 }] }
    if (sql.includes("'in', $2")) { const first = !seen; seen = true; return { rows: first ? [{ id: 'x' }] : [] } }
    return { rows: [], rowCount: 1 }
  }
  const msg = { from: '919876543210', id: 'wamid.A', timestamp: String(Math.floor(Date.now() / 1000)), type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'prices', title: '💰 Prices' } } }
  const payload = { entry: [{ changes: [{ field: 'messages', value: { messages: [msg] } }] }] }
  await handleWebhook(payload, { query, contactsPath: async () => {}, bot: async (a) => asked.push(a) })
  await handleWebhook(payload, { query, contactsPath: async () => {}, bot: async (a) => asked.push(a) })
  assert.equal(asked.length, 1)
  assert.deepEqual({ to: asked[0].to, phone: asked[0].phone, replyId: asked[0].replyId }, { to: '919876543210', phone: '9876543210', replyId: 'prices' })
})

// ---- Phases 2–4: segments, broadcasts, the queue's rules ----
import { segmentWhere } from '../lib/wa/contacts.js'
import { valuesFor } from '../lib/wa/broadcasts.js'
import { sendQueue } from '../lib/wa/automations.js'

test('segments: filters become safe SQL with parameters', () => {
  const [where, params] = segmentWhere({ q: "Ravi'; drop", permission: 'in', bought: 'yes', lastOrderMin: 30, packKg: 26, spinUnused: 'true', source: 'buyer', tag: 'VIP' })
  assert.match(where, /opted_in_at is not null and x\.opted_out_at is null/)
  assert.match(where, /x\.orders > 0/)
  assert.match(where, /x\.spin_unused/)
  assert.ok(!where.includes('drop'))
  assert.deepEqual(params.slice(1), ['vip', 30, 26, 'buyer'])
  assert.equal(segmentWhere({})[0], '')
})

test('broadcasts: each person gets their own values', () => {
  const v = valuesFor({ name: 'Meena Devi', city: 'Madurai', lastProduct: 'Kitchidi Ponni Rice', lastPackKg: 26 },
    { body: [{ from: 'first_name' }, { from: 'last_product' }, { from: 'fixed', text: '₹50' }], buttons: { 1: { from: 'fixed', text: 'back-DIWALI' } } })
  assert.deepEqual(v.body, ['Meena', 'Kitchidi Ponni Rice 26 kg', '₹50'])
  assert.deepEqual(v.buttons, { 1: 'back-DIWALI' })
})

test('queue: no offers without a yes, none after STOP, 1 a day; utility still goes', async () => {
  const sent = []
  const people = { '9000000001': { opted_in_at: new Date() }, '9000000002': { opted_in_at: new Date(), opted_out_at: new Date() }, '9000000003': null, '9000000004': { opted_in_at: new Date() } }
  const rows = [
    { id: 1, phone: '9000000001', template_name: 't', language: 'en', category: 'marketing', source: 'broadcast', vals: {}, attempts: 1 },
    { id: 2, phone: '9000000002', template_name: 't', language: 'en', category: 'marketing', source: 'broadcast', vals: {}, attempts: 1 },
    { id: 3, phone: '9000000003', template_name: 't', language: 'en', category: 'marketing', source: 'broadcast', vals: {}, attempts: 1 },
    { id: 4, phone: '9000000004', template_name: 't', language: 'en', category: 'marketing', source: 'broadcast', vals: {}, attempts: 1 },
    { id: 5, phone: '9000000003', template_name: 't', language: 'en', category: 'utility', source: 'review', vals: {}, attempts: 1 },
  ]
  const outcome = {}
  const query = async (sql, args = []) => {
    if (sql.startsWith('update wa_queue set attempts = attempts + 1')) return { rows }
    if (sql.startsWith('select * from wa_templates')) return { rows: [{ name: 't', language: 'en', components: [{ type: 'BODY', text: 'Hello there' }] }] }
    if (sql.includes('from wa_contacts where phone')) return { rows: people[args[0]] ? [people[args[0]]] : [] }
    if (sql.includes('as day, count(*)')) return { rows: [{ day: args[0] === '9000000004' ? 1 : 0, week: 1 }] }
    if (sql.includes("status in ('placed'")) return { rows: [] }
    if (sql.startsWith("update wa_queue set status = 'skipped'")) { outcome[args[0]] = args[1]; return { rows: [] } }
    if (sql.startsWith("update wa_queue set status = 'sent'")) { outcome[args[0]] = 'sent'; return { rows: [] } }
    return { rows: [], rowCount: 1 }
  }
  const realNow = Date.now
  Date.now = () => new Date('2026-11-11T06:30:00Z').getTime() // 12 noon India time
  process.env.WHATSAPP_TOKEN = 'test'
  try {
    const fetchImpl = async (url, opts) => { sent.push(JSON.parse(opts.body).to); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.' + sent.length }] }) } }
    await sendQueue({ query, fetchImpl })
  } finally { Date.now = realNow }
  assert.equal(outcome[1], 'sent')
  assert.equal(outcome[2], 'said STOP')
  assert.equal(outcome[3], 'no WhatsApp permission')
  assert.match(outcome[4], /frequency/)
  assert.equal(outcome[5], 'sent')
  assert.deepEqual(sent, ['919000000001', '919000000003'])
})
