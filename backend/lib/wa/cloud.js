// Meta's WhatsApp Cloud API: our own connection, in place of AskEva (Nov 2026).
//
//   WHATSAPP_TOKEN          a system user token (whatsapp_business_messaging, whatsapp_business_management)
//   WHATSAPP_APP_SECRET     the app secret: checks that webhook calls really come from Meta
//   WHATSAPP_VERIFY_TOKEN   the phrase typed into Meta's webhook screen
//   WHATSAPP_WABA_ID        the WhatsApp Business Account (default: the +91 70666 46667 account)
//   WHATSAPP_PHONE_ID       the phone number we send from (default: +91 70666 46667)
//   WHATSAPP_GRAPH_VERSION  optional, default v23.0
//
// The two IDs are not secret; they can be overridden for testing on another number.
import { httpError } from '../sales/util.js'

// The account ID found from the token (company_settings 'whatsapp_waba_id', see findWabaId) wins over the default.
let wabaFound = null
export const WABA_ID = () => wabaFound || process.env.WHATSAPP_WABA_ID || '2041179226534821'
export const setWabaId = (id) => { wabaFound = id ? String(id) : null }
export const PHONE_ID = () => process.env.WHATSAPP_PHONE_ID || '1508922538960389'
const VERSION = () => process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'
export const cloudEnabled = () => Boolean(process.env.WHATSAPP_TOKEN)

/** Meta's error, in words a person can act on (never the token). */
function metaError(data, status) {
  const e = data?.error || {}
  const detail = e.error_user_msg || e.error_data?.details || e.message || `HTTP ${status}`
  const err = httpError(`Meta ${status}: ${detail}`, { status: status >= 500 ? 502 : 400, publicMessage: `WhatsApp (Meta) said: ${detail}` })
  err.meta = { status, code: e.code, subcode: e.error_subcode, title: e.error_user_title }
  return err
}

/**
 * One Graph API call. `path` like '/123/messages'; `query` for GET parameters; `body` as JSON.
 * `fetchImpl` lets tests stand in for Meta.
 */
export async function graph(path, { method = 'GET', query, body, headers, raw, fetchImpl = fetch, timeout = 15000 } = {}) {
  if (!cloudEnabled()) throw httpError('No WHATSAPP_TOKEN', { status: 503, publicMessage: 'WhatsApp is not connected yet (WHATSAPP_TOKEN is not set).' })
  const url = new URL(path.startsWith('http') ? path : `https://graph.facebook.com/${VERSION()}${path}`)
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v))
  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(timeout),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) throw metaError(data, res.status)
  return data
}

/** The phone number and account as Meta sees them: name, quality, daily limit, currency… */
export async function accountInfo({ fetchImpl } = {}) {
  const [phone, waba] = await Promise.all([
    graph(`/${PHONE_ID()}`, {
      fetchImpl,
      query: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,platform_type,throughput,status' },
    }).catch((err) => ({ error: err.publicMessage || err.message })),
    graph(`/${WABA_ID()}`, {
      fetchImpl,
      query: { fields: 'id,name,currency,account_review_status' },
    }).catch((err) => ({ error: err.publicMessage || err.message })),
  ])
  return { phone, waba }
}

/**
 * Which WhatsApp Business Accounts the token can reach (from Meta's token check), and which of them holds our
 * phone number. Returns { found, accounts: [{ id, phones }] }.
 */
export async function findWabaId({ fetchImpl } = {}) {
  const info = await graph('/debug_token', { fetchImpl, query: { input_token: process.env.WHATSAPP_TOKEN } })
  const scopes = info?.data?.granular_scopes || []
  const ids = [...new Set(scopes
    .filter((s) => /^whatsapp_business_(management|messaging)$/.test(s.scope))
    .flatMap((s) => s.target_ids || []).map(String))]
  const accounts = []
  for (const id of ids.slice(0, 10)) {
    const phones = await graph(`/${id}/phone_numbers`, { fetchImpl, query: { fields: 'id,display_phone_number' } })
      .then((d) => (d.data || []).map((p) => ({ id: String(p.id), number: p.display_phone_number })))
      .catch(() => null)
    accounts.push({ id, phones })
  }
  const found = accounts.find((a) => a.phones?.some((p) => p.id === PHONE_ID()))?.id || null
  return { found, accounts }
}

/** Is our app subscribed to the account's webhooks? */
export async function webhookSubscribed({ fetchImpl } = {}) {
  const data = await graph(`/${WABA_ID()}/subscribed_apps`, { fetchImpl })
  return (data.data || []).map((a) => a.whatsapp_business_api_data || a)
}

/** Subscribes our app to the account's webhooks (Meta then calls /api/whatsapp/webhook). */
export async function subscribeWebhook({ fetchImpl } = {}) {
  return graph(`/${WABA_ID()}/subscribed_apps`, { method: 'POST', fetchImpl })
}

/** The app the token belongs to (needed to upload a header picture for a template). */
export async function appId({ fetchImpl } = {}) {
  if (process.env.WHATSAPP_APP_ID) return process.env.WHATSAPP_APP_ID
  const data = await graph('/debug_token', { fetchImpl, query: { input_token: process.env.WHATSAPP_TOKEN } })
  const id = data?.data?.app_id
  if (!id) throw httpError('No app id', { status: 502, publicMessage: 'Could not find the Meta app for this token.' })
  return id
}

/**
 * Uploads a picture, video or PDF for a template header (Meta's resumable upload) and returns the handle
 * Meta wants in the template's example.
 */
export async function uploadHeaderSample(buffer, mimeType, { fetchImpl } = {}) {
  const app = await appId({ fetchImpl })
  const session = await graph(`/${app}/uploads`, { method: 'POST', fetchImpl, query: { file_length: buffer.length, file_type: mimeType } })
  const res = await (fetchImpl || fetch)(`https://graph.facebook.com/${VERSION()}/${session.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${process.env.WHATSAPP_TOKEN}`, file_offset: '0' },
    body: buffer,
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.h) throw metaError(data, res.status)
  return data.h
}

/** Meta's message body for a template: `params` fill {{1}}, {{2}}… in the body; `extra` adds header / button parts. */
export function templateMessage(to, name, { language = 'en', params = [], components = [] } = {}) {
  const parts = [...components]
  if (params.length) parts.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) })
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: { name, language: { code: language }, ...(parts.length ? { components: parts } : {}) },
  }
}

/** Sends one message (any Cloud API message body) and returns Meta's message id. */
/** Uploads a picture or PDF to send in a chat (Meta keeps it 30 days) and returns its media id. */
export async function uploadMedia(buffer, mimeType, fileName = 'file', { fetchImpl } = {}) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mimeType)
  form.append('file', new Blob([buffer], { type: mimeType }), fileName)
  const data = await graph(`/${PHONE_ID()}/media`, { method: 'POST', raw: form, fetchImpl, timeout: 60000 })
  return data?.id || null
}

/** A chat picture or PDF (ours or the customer's) by its media id: { buffer, type }. */
export async function downloadMedia(id, { fetchImpl = fetch } = {}) {
  const info = await graph(`/${encodeURIComponent(id)}`, { fetchImpl })
  if (!info?.url) throw httpError('No media', { status: 404, publicMessage: 'This file is no longer on WhatsApp.' })
  const res = await fetchImpl(info.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw httpError('Media download failed', { status: 502, publicMessage: 'Could not load this file from WhatsApp.' })
  return { buffer: Buffer.from(await res.arrayBuffer()), type: info.mime_type || res.headers.get('content-type') || 'application/octet-stream' }
}

export async function sendMessage(message, { fetchImpl } = {}) {
  const data = await graph(`/${PHONE_ID()}/messages`, { method: 'POST', body: message, fetchImpl })
  return data?.messages?.[0]?.id || null
}
