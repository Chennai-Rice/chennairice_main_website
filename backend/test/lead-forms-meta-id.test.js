// Sales Daddy's meta_lead_id (Leads API, 25 Nov 2026): which leads count as Meta form leads, and the ID kept exact.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFormLead, metaLeadId } from '../lib/lead-forms.js'
import { leadFormEvent } from '../lib/sales/meta-capi.js'

test('meta_lead_id is kept as text and only when it looks like a Meta ID', () => {
  assert.equal(metaLeadId({ meta_lead_id: '1476874734548308' }), '1476874734548308')
  assert.equal(metaLeadId({ meta_lead_id: '29452165347740481' }), '29452165347740481') // 17 digits, exact
  assert.equal(metaLeadId({ meta_lead_id: null }), null)
  assert.equal(metaLeadId({}), null)
  assert.equal(metaLeadId({ meta_lead_id: 'abc' }), null)
})

test('a form lead is one with meta_lead_id, or (older leads) facebook/instagram with a form or Page', () => {
  assert.equal(isFormLead({ source: 'website', meta_lead_id: '1476874734548308' }), true)
  assert.equal(isFormLead({ source: 'facebook', form_name: 'B2C FORM', meta_lead_id: null }), true)
  assert.equal(isFormLead({ source: 'website', meta_lead_id: null }), false)
  assert.equal(isFormLead({ source: 'whatsapp' }), false)
})

test('the Conversions API event carries the lead ID as exact text, and none when unknown', () => {
  const ev = leadFormEvent({ sd_lead_id: 'sd-1', name: 'Test Buyer', mobile: '9811100009', meta_lead_id: '29452165347740481' })
  assert.equal(ev.user_data.lead_id, '29452165347740481')
  assert.equal('lead_id' in leadFormEvent({ sd_lead_id: 'sd-2', name: 'Test', mobile: '9811100009' }).user_data, false)
})
