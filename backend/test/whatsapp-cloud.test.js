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
