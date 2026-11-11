// Diwali contest button taps go to Chennai Fresh Foods, never into this site
// (cff-contest.js). No database is needed: a tap leaves before it is touched.
import test from 'node:test'
import assert from 'node:assert/strict'
import { isContestTap, withoutContestTaps } from '../lib/cff-contest.js'
import { recordAskevaWebhook } from '../lib/askeva-inbound.js'

const meta = (messages) => ({
  entry: [{ changes: [{ value: {
    metadata: { display_phone_number: '918098059999' },
    contacts: [{ wa_id: '919500044444', profile: { name: 'Divya R' } }],
    messages,
  } }] }],
})
const tap = { from: '919500044444', id: 'wamid.T1', timestamp: '1762415400', type: 'button', button: { text: 'ஆர்டர் செய்ய', payload: 'ஆர்டர் செய்ய' } }
const chat = { from: '919500044444', id: 'wamid.C1', timestamp: '1762415400', type: 'text', text: { body: 'Ponni price?' } }

function fakeCff(status = 200) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, key: init.headers['X-API-Key'], body: JSON.parse(init.body) })
    return { ok: status < 300, status }
  }
  return { calls, restore: () => { globalThis.fetch = real } }
}

test('contest button text is recognised whatever the spacing, other buttons are not', () => {
  assert.equal(isContestTap('ஆர்டர் செய்ய'), true)
  assert.equal(isContestTap('  ஆர்டர்  செய்ய '), true)
  assert.equal(isContestTap('ஆர்டர் வேண்டும்'), false)
  assert.equal(isContestTap('Hi'), false)
})

test('a contest tap is handed to the CFF backend and nothing is kept here', async () => {
  process.env.CFF_TAP_WEBHOOK_KEY = 'cff-key'
  const cff = fakeCff()
  try {
    const r = await recordAskevaWebhook(meta([tap]))
    assert.deepEqual(r, { ok: true, messages: 0, contest: 1 })
    assert.equal(cff.calls.length, 1)
    assert.equal(cff.calls[0].url, 'https://cff-api-415853810680.asia-south1.run.app/api/askeva/webhook')
    assert.equal(cff.calls[0].key, 'cff-key')
    assert.equal(cff.calls[0].body.entry[0].changes[0].value.messages[0].button.text, 'ஆர்டர் செய்ய')
  } finally { cff.restore(); delete process.env.CFF_TAP_WEBHOOK_KEY }
})

test('when CFF cannot take the tap, AskEva is asked to send it again (502)', async () => {
  process.env.CFF_TAP_WEBHOOK_KEY = 'cff-key'
  const cff = fakeCff(500)
  try {
    await assert.rejects(recordAskevaWebhook(meta([tap])), (err) => err.status === 502)
    assert.equal(cff.calls.length, 2) // tried twice
  } finally { cff.restore(); delete process.env.CFF_TAP_WEBHOOK_KEY }
})

test('ordinary chat is not sent to CFF', async () => {
  process.env.CFF_TAP_WEBHOOK_KEY = 'cff-key'
  const cff = fakeCff()
  try {
    await recordAskevaWebhook(meta([chat])).catch(() => {}) // carries on to this site's own handling
    assert.equal(cff.calls.length, 0)
  } finally { cff.restore(); delete process.env.CFF_TAP_WEBHOOK_KEY }
})

test('the stored copy of a mixed webhook leaves the contest tap out', () => {
  const kept = withoutContestTaps(meta([tap, chat]))
  assert.deepEqual(kept.entry[0].changes[0].value.messages.map((m) => m.id), ['wamid.C1'])
  assert.deepEqual(withoutContestTaps({ from: '919500044444', buttonText: 'ஆர்டர் செய்ய' }), {})
})
