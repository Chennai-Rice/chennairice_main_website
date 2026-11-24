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
  buttons: [{ type: 'COPY_CODE', sample: 'SPINA1' }, { type: 'URL', text: 'Shop now', url: 'https://chennairiceindustries.com/w/{{1}}', sample: 'spin-A1' }],
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
  assert.equal(back.buttons[0].sample, 'SPINA1')
  assert.equal(back.footer, m.footer)
})

test('send parameters fill the body, the link ending and the coupon code', () => {
  const parts = sendComponents(good(), { body: ['Meena', '₹50 OFF'], buttons: { 0: 'SPIN-ZZ', 1: 'spin-ZZ' } })
  assert.deepEqual(parts[0].parameters.map((p) => p.text), ['Meena', '₹50 OFF'])
  assert.deepEqual(parts[1], { type: 'button', sub_type: 'copy_code', index: '0', parameters: [{ type: 'coupon_code', coupon_code: 'SPINZZ' }] })
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
import { DEFAULT_BOT, cleanBot, decide, render, menuMsg, priceListText } from '../lib/wa/bot.js'

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
  // Without AI: keywords inside sentences, and the fallback menu.
  const bot = cleanBot({ ...DEFAULT_BOT, ai: { enabled: false } })
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
  // Waiting for the order number: "menu", "hi", "cancel" or a menu item still work; anything else is asked once,
  // with the menu, and the bot stops waiting (24 Nov 2026: customers were stuck on "That does not look like…").
  const waiting = { awaiting: 'order_number', awaiting_at: new Date() }
  assert.equal(decide(bot, { text: 'menu' }, waiting).kind, 'welcome')
  assert.equal(decide(bot, { text: 'Hi' }, waiting).kind, 'welcome')
  assert.equal(decide(bot, { text: 'cancel' }, waiting).kind !== 'track', true)
  assert.equal(decide(bot, { text: 'CR-20261111-AB12C' }, waiting).kind, 'track')
  const wrong = await render(bot, decide(bot, { text: 'where is it' }, waiting), {}, deps)
  assert.equal(wrong.state.awaiting, null)
  assert.equal(wrong.messages[0].type, 'interactive')
  assert.match(JSON.stringify(wrong.messages[0]), /does not look like an order number/)
  const pin = await render(bot, decide(bot, { text: 'my pin is 600001' }, { awaiting: 'pincode', awaiting_at: new Date() }), {}, deps)
  assert.match(pin.messages[0].text.body, /We deliver to 600001/)

  const offers = await render(bot, decide(bot, { replyId: 'offers' }), { phone: '9876543210' }, deps)
  assert.match(offers.messages[0].text.body, /SPIN-A745B4/)
  const prices = await render(bot, decide(bot, { replyId: 'prices' }), {}, deps)
  assert.ok(prices.messages[0].text.body.includes('*Kitchadi Ponni*\n5 kg *₹425*'))
  const hand = await render(bot, decide(bot, { replyId: 'human' }), {}, deps)
  assert.equal(hand.state.pausedHours, 12)
  const fb = await render(bot, decide(bot, { text: 'zzz' }), {}, deps)
  assert.equal(fb.messages[0].interactive.type, 'list')
})

test('bot with AI: sentences go to the AI, short words still get the menu; Groq down → the menu', async () => {
  assert.equal(bot.ai.enabled, true)
  assert.equal(decide(bot, { text: 'I ORDERED ON 10TH NOVEMBER I AM IN CHENNAI STIL NOT DELIVERED' }).kind, 'ai')
  assert.equal(decide(bot, { text: 'hi I need to talk to someone about my order' }).kind, 'ai')
  assert.equal(decide(bot, { text: 'WHY NO ONE IS CHATTING' }).kind, 'ai')
  assert.equal(decide(bot, { text: 'price' }).item.id, 'prices')
  assert.equal(decide(bot, { text: 'hi' }).kind, 'welcome')
  assert.equal(decide(bot, { text: 'CR-20261111-AB12C is my order number' }).kind, 'track')

  const said = await render(bot, { kind: 'ai', text: 'which rice for biryani?' }, { phone: '9876543210', name: 'Ravi' },
    { ...deps, ai: async () => ({ reply: 'For biryani, Nayara Super Aged stays separate and fluffy 🍚', handoff: false, reason: '', order: '' }) })
  assert.equal(said.messages[0].text.body, 'For biryani, Nayara Super Aged stays separate and fluffy 🍚')
  assert.equal(said.state.ai.handoff, false)
  const passed = await render(bot, { kind: 'ai', text: 'still not delivered' }, {},
    { ...deps, ai: async () => ({ reply: 'So sorry, I have flagged it to our team.', handoff: true, reason: 'late', order: '' }) })
  assert.equal(passed.state.pausedHours, 12)
  const down = await render(bot, { kind: 'ai', text: 'hello there friend' }, {}, { ...deps, ai: async () => { throw new Error('Groq 503') } })
  assert.equal(down.messages[0].interactive.type, 'list')
  const quiet = await render(bot, { kind: 'ai', text: 'any update?', handedOver: true }, {}, { ...deps, ai: async () => { throw new Error('Groq 503') } })
  assert.match(quiet.messages[0].text.body, /Our team will get back to you here soon/) // never silence after a handover
})

test('AI reply: built from the customer\x27s own orders, a late order is always handed over and flagged', async () => {
  const { aiReply, systemPrompt, teamHours } = await import('../lib/wa/ai.js')
  const placed = new Date(Date.now() - 5 * 86400e3)
  const query = async (sql) => {
    if (sql.includes('from orders o')) {
      return { rows: [{ id: 'o1', order_number: 'CR-20261110-5YWU3', status: 'placed', payment_status: 'paid', total_paise: 116000, created_at: placed,
        delivery_method: 'courier', city: 'Chennai', items: '1 × Kitchadi Ponni Rice (5 kg)', tracking_url: null, expected_delivery: null, carrier_name: null }] }
    }
    if (sql.includes('from wa_messages')) return { rows: [{ direction: 'in', body: 'I ORDERED ON 10TH NOVEMBER STILL NOT DELIVERED', source: null }] }
    return { rows: [] }
  }
  let sent
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Very sorry for the delay! Your order is with our dispatch team now.', handoff: false, reason: '', order: '' }) } }] }) }
  }
  const prev = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-key'
  try {
    const out = await aiReply({ phone: '9940303259', name: 'Chidambaranathan B', text: 'I ORDERED ON 10TH NOVEMBER STILL NOT DELIVERED' },
      { query, deps: { prices: async () => [{ name: 'Kitchadi Ponni Rice', packKg: 5, price: 1160 }], offers: async () => [] }, fetchImpl })
    // The model saw the order, as late, and today's price; the message is not sent twice.
    const system = sent.messages[0].content
    assert.match(system, /CR-20261110-5YWU3: placed .*(5 days ago)/)
    assert.match(system, /LATE: paid but not dispatched/)
    assert.match(system, /Kitchadi Ponni Rice, 5 kg pack: ₹1160 for the whole 5 kg pack/)
    assert.equal(sent.messages.filter((m) => m.role === 'user').length, 1)
    assert.deepEqual(sent.response_format, { type: 'json_object' })
    // The model did not hand over, but a late order always is, and it is the order flagged.
    assert.equal(out.handoff, true)
    assert.equal(out.order, 'CR-20261110-5YWU3')
    assert.match(out.reply, /sorry/i)
  } finally {
    if (prev === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = prev
  }
  // Another customer's order number from the model is never flagged; working hours are India time.
  assert.equal(teamHours(new Date('2026-11-16T05:00:00Z')).open, true) // Monday 10:30 IST
  assert.equal(teamHours(new Date('2026-11-15T05:00:00Z')).open, false) // Sunday
  assert.match(systemPrompt({ name: '', orders: [], prices: [], offers: [], hours: teamHours(), handedOver: true }), /already been passed to the team/)
})

test('AI photos: a payment screenshot is matched to their order; unmatched payments and damaged packs go to the team', async () => {
  const { aiReply } = await import('../lib/wa/ai.js')
  assert.equal(decide(bot, { text: '', image: { id: 'm1' } }).kind, 'ai')
  assert.equal(decide(cleanBot({ ...DEFAULT_BOT, ai: { enabled: false } }), { image: { id: 'm1' } }).kind, 'fallback')

  const placed = new Date(Date.now() - 5 * 86400e3)
  const query = async (sql) => {
    if (sql.includes('from orders o')) {
      return { rows: [{ id: 'o1', order_number: 'CR-20261110-5YWU3', status: 'placed', payment_status: 'paid', total_paise: 116000, created_at: placed,
        delivery_method: 'courier', city: 'Chennai', items: '1 × Kitchidi Ponni Rice (5 kg)' }] }
    }
    return { rows: [] }
  }
  const run = async (seen) => {
    const calls = []
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body)
      calls.push(body)
      const content = Array.isArray(body.messages[0].content)
        ? JSON.stringify(seen)
        : JSON.stringify({ reply: 'Thank you! We have your payment.', handoff: false, reason: '', order: '' })
      return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
    }
    const prev = process.env.GROQ_API_KEY
    process.env.GROQ_API_KEY = 'test-key'
    try {
      const out = await aiReply({ phone: '9940303259', name: 'C', text: '', image: { id: 'm1', caption: '' } },
        { query, deps: { prices: async () => [], offers: async () => [], downloadMedia: async () => ({ buffer: Buffer.from('jpeg'), type: 'image/jpeg' }) }, fetchImpl })
      return { out, vision: calls[0], system: calls[1].messages[0].content, user: calls[1].messages.findLast((m) => m.role === 'user').content }
    } finally {
      if (prev === undefined) delete process.env.GROQ_API_KEY
      else process.env.GROQ_API_KEY = prev
    }
  }

  // GPay ₹1,160 completed: their paid order of ₹1,160 — confirmed, and (late) handed over with that order.
  const paid = await run({ kind: 'payment', summary: 'Google Pay payment to Chennai Rice', amount: 1160, date: '10 Nov 2026', status: 'Completed', app: 'Google Pay' })
  assert.equal(paid.vision.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64'))
  assert.match(paid.system, /matches their order CR-20261110-5YWU3, which our system ALREADY shows as PAID/)
  assert.equal(paid.user, '📷 Photo')
  assert.equal(paid.out.order, 'CR-20261110-5YWU3')
  assert.equal(paid.out.handoff, true) // the order is late
  assert.equal(paid.out.photo.amount, 1160)

  // A payment that matches nothing: never confirmed, the team checks it.
  const other = await run({ kind: 'payment', summary: 'PhonePe payment', amount: 999, status: 'Completed' })
  assert.match(other.system, /does not match any order of theirs/)
  assert.equal(other.out.handoff, true)
  assert.match(other.out.reason, /matches no order/)

  // A torn pack: the team's.
  const torn = await run({ kind: 'damaged_or_wrong', summary: 'A torn 5 kg rice pack with rice spilled' })
  assert.equal(torn.out.handoff, true)
  assert.match(torn.out.reason, /torn 5 kg/)
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
    // The day's offer claim (migration 058): free for everyone here.
    if (sql.includes('set last_offer_at = now()')) return { rows: [{ before: null }] }
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

test('broadcast files: CSV with quotes and a BOM, mobile and name columns found, values from columns', async () => {
  const { parseSheet, guessColumns } = await import('../lib/wa/sheet.js')
  const { valuesFor } = await import('../lib/wa/broadcasts.js')
  const { columns, rows } = await parseSheet(Buffer.from('\uFEFFCustomer Name;Phone;Offer\nRavi Kumar;+91 98765 00001;"₹75; OFF"\n'), 'a.csv')
  assert.deepEqual(columns, ['Customer Name', 'Phone', 'Offer'])
  assert.equal(rows[0].Offer, '₹75; OFF')
  assert.deepEqual(guessColumns(columns, rows), { phone: 'Phone', name: 'Customer Name' })
  const v = valuesFor({ name: 'Ravi Kumar', cols: rows[0] }, { body: [{ from: 'first_name' }, { from: 'col', col: 'Offer' }], buttons: { 0: { from: 'col', col: 'Missing', text: 'x' } } })
  assert.deepEqual(v, { body: ['Ravi', '₹75; OFF'], buttons: { 0: 'x' } })
})

test('AI model call: a reply Groq refuses as invalid JSON is asked again; the token limit falls back to the smaller model; text around JSON is fine', async () => {
  const { askModel, parseAnswer } = await import('../lib/wa/ai.js')
  const res = (status, body) => ({ status, ok: status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body })
  const answer = (content) => res(200, { choices: [{ message: { content } }] })
  const seen = []
  const replies = [
    res(400, '{"error":{"code":"json_validate_failed","message":"Failed to generate JSON."}}'),
    res(429, '{"error":{"message":"Rate limit reached"}}'),
    answer('Sure! {"reply": "Nayara Super Aged suits biryani.", "handoff": false, "reason": "", "order": ""}'),
  ]
  const fetchImpl = async (url, init) => { seen.push(JSON.parse(init.body)); return replies.shift() }
  const out = await askModel({ system: 'x', history: [{ role: 'assistant', content: 'menu' }], text: 'which rice for biryani' }, { fetchImpl, apiKey: 'k' })
  assert.equal(out.reply, 'Nayara Super Aged suits biryani.')
  assert.deepEqual(seen.map((b) => [b.model, Boolean(b.response_format)]), [['openai/gpt-oss-120b', true], ['openai/gpt-oss-120b', false], ['openai/gpt-oss-20b', false]])
  assert.equal(seen[0].messages.at(-1).role, 'system') // the JSON reminder is the last word
  assert.deepEqual(parseAnswer('Plain words only'), { reply: 'Plain words only' })
})

import { updateChat } from '../lib/wa/inbox.js'

test('Inbox: Intervene assigns the chat to the person, opens it and pauses the bot there', async () => {
  const calls = []
  const query = async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: [] } }
  await updateChat('9840000001', { intervene: true }, { id: 'staff-1' }, { query })
  const assign = calls.find((c) => /set assigned_to = \$2, status = 'open'/.test(c.sql))
  assert.deepEqual(assign?.params, ['9840000001', 'staff-1'])
  assert.ok(calls.some((c) => /insert into wa_bot_state/.test(c.sql) && c.params[0] === '9840000001'), 'bot paused')
  // Without intervene, nothing is assigned or paused.
  calls.length = 0
  await updateChat('9840000001', {}, { id: 'staff-1' }, { query })
  assert.ok(!calls.some((c) => /assigned_to|wa_bot_state/.test(c.sql)))
})

import { broadcastReport } from '../lib/wa/broadcasts.js'

test('Broadcasts → Details: the split of sent (read, delivered, not delivered), yet to send and held back by reason', async () => {
  const later = new Date(Date.now() + 3600e3)
  const rows = [
    { phone: '9000000001', status: 'sent', delivery: 'read', replied_at: new Date(), replies: 'Hi | My mail is Priya.Foodie@Gmail.com thanks' },
    { phone: '9000000002', status: 'sent', delivery: 'delivered' },
    { phone: '9000000003', status: 'sent', delivery: 'failed', error: '131026 Message undeliverable' },
    { phone: '9000000004', status: 'sent', delivery: 'failed', error: '(#131049) This message was not delivered to maintain healthy ecosystem engagement.' },
    { phone: '9000000005', status: 'sent', delivery: 'sent' },
    { phone: '9000000006', status: 'queued', send_after: later },
    { phone: '9000000007', status: 'skipped', reason: 'frequency limit (1 a day, 3 a week)' },
    { phone: '9000000008', status: 'skipped', reason: 'said STOP' },
    { phone: '9000000009', status: 'failed', reason: '(#131030) Recipient phone number not in allowed list' },
  ]
  const query = async (sql) => /from wa_broadcasts/.test(sql)
    ? { rows: [{ id: 'b1', name: 'Test', template_name: 't', audience: 9, status: 'sending' }] }
    : { rows }
  const r = await broadcastReport('b1', { query, rows: true })
  assert.equal(r.total, 9)
  assert.deepEqual([r.sent.total, r.waiting.total, r.held.total], [5, 1, 3])
  const sent = Object.fromEntries(r.sent.parts.map((x) => [x.label, x.n]))
  assert.equal(sent['Not delivered'], 2)
  assert.equal(sent.Read, 1)
  assert.deepEqual(r.sent.notDeliveredByCode.map((x) => x.code).sort(), ['131026', '131049'])
  const held = r.held.parts.map((x) => x.label).join(' | ')
  assert.match(held, /frequency limit/)
  assert.match(held, /Said STOP/)
  assert.match(held, /error 131030/)
  assert.equal(r.people.length, 9)
  assert.deepEqual(r.replied, { total: 1, withEmail: 1 })
  assert.equal(r.people.find((p) => p.phone === '9000000001').email, 'priya.foodie@gmail.com')
})

test('Bot: the "needs a reply" handoff email is off unless switched on in Bot settings', async () => {
  const { aiHandoff } = await import('../lib/wa/bot.js')
  assert.equal(cleanBot(DEFAULT_BOT).handoffEmail, false)
  assert.equal(cleanBot({ ...DEFAULT_BOT, handoffEmail: true }).handoffEmail, true)
  const sql = []
  const query = async (s) => { sql.push(s.replace(/\s+/g, ' ')); return { rows: [] } } // no saved settings: the default (off)
  await aiHandoff({ phone: '9000000001', name: 'Test', text: 'Hi', ai: { reason: 'Needs a person', reply: 'Sure' } }, { query })
  assert.ok(sql.some((s) => /insert into wa_notes/.test(s)), 'the AI note is still saved')
  assert.ok(!sql.some((s) => /email_outbox|staff_users/.test(s)), 'no email is queued')
})

test('price list: two lines per rice (name, then all packs smallest first), saving once at the top, delivery and link at the end', () => {
  const t = priceListText([
    { name: 'Kitchadi Ponni', packKg: 26, price: 2499, mrp: 2999 }, { name: 'Kitchadi Ponni', packKg: 5, price: 555, mrp: 699 },
    { name: 'Special Idly Rice', packKg: 10, price: 599, mrp: 799 },
  ])
  assert.ok(t.startsWith("🍚 *Today's prices* — up to 25% off MRP"))
  assert.ok(priceListText([{ name: 'X', packKg: 5, price: 1 }], "Here are today's prices:").startsWith("🍚 *Here are today's prices*\n"))
  assert.ok(t.includes('*Kitchadi Ponni*\n5 kg *₹555*  ·  26 kg *₹2,499*'))
  assert.ok(t.includes('\n\n*Special Idly Rice*\n10 kg *₹599*'))
  assert.ok(!t.includes('~'))
  assert.match(t, /Delivery depends on your PIN code/)
  assert.ok(t.includes('/w/shop-bot'))
  assert.match(priceListText([]), /prices are on the website/)
})
