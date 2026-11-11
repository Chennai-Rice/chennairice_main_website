// The Diwali slogan contest (AskEva template diwali_slogan_contest, Nov 2026)
// is sent from this WhatsApp number but belongs to Chennai Fresh Foods.
// Whoever taps its quick-reply button "ஆர்டர் செய்ய" is a Chennai Fresh
// Foods lead (owner, 6 Nov 2026). Such a tap is handed to the CFF backend,
// which makes the lead in the "Chennai Fresh Foods" Sales Daddy workspace
// (CFF_main_webiste-, backend/src/whatsapp/contestTaps.js). Nothing about it
// is saved here or sent to this site's Sales Daddy workspace.
//
//   AskEva ─▶ /api/askeva/webhook (this site) ─▶ contest tap? ─▶ CFF /api/askeva/webhook
//                                                    │ no
//                                                    ▼
//                                     askeva-inbound.js as before (retailer block etc.)
//
// The check runs before the retailer-campaign block, so a tap from a blocked
// retailer number still reaches Chennai Fresh Foods.
//
//   CFF_TAP_WEBHOOK_KEY   the CFF backend's AskEva key (its secret askeva-webhook-key)
//   CFF_TAP_WEBHOOK_URL   optional, defaults to the CFF Cloud Run service
//   CFF_CONTEST_BUTTONS   optional, button texts separated by | (default: ஆர்டர் செய்ய)

const DEFAULT_URL = 'https://cff-api-415853810680.asia-south1.run.app/api/askeva/webhook'

const norm = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
const buttons = () => (process.env.CFF_CONTEST_BUTTONS || 'ஆர்டர் செய்ய').split('|').map(norm).filter(Boolean)

/** True when `text` (a message's text or button label) is the contest button. */
export const isContestTap = (text) => buttons().includes(norm(text))

/** A message's button label or text, in the shapes askeva-inbound.js reads. */
const labelOf = (m) => {
  if (!m || typeof m !== 'object') return ''
  if (m.message && typeof m.message === 'object') return labelOf(m.message)
  return m.button?.text || m.interactive?.button_reply?.title || m.buttonText || m.button_text
    || (typeof m.text === 'string' ? m.text : m.text?.body) || (typeof m.body === 'string' ? m.body : '') || (typeof m.message === 'string' ? m.message : '')
}

/**
 * The webhook body with the contest taps taken out, for the copy this site
 * keeps (askeva_events) when a tap arrives together with other messages.
 */
export function withoutContestTaps(payload) {
  const strip = (body) => {
    if (!body || typeof body !== 'object') return body
    if (Array.isArray(body.entry)) {
      return { ...body, entry: body.entry.map((e) => ({ ...e, changes: (e?.changes || []).map((c) => ({ ...c, value: c?.value && { ...c.value, messages: (c.value.messages || []).filter((m) => !isContestTap(labelOf(m))) } })) })) }
    }
    if (Array.isArray(body.messages)) return { ...body, messages: body.messages.filter((m) => !isContestTap(labelOf(m))) }
    if (Array.isArray(body.data)) return { ...body, data: body.data.filter((m) => !isContestTap(labelOf(m))) }
    return isContestTap(labelOf(body.data && typeof body.data === 'object' ? body.data : body)) ? {} : body
  }
  return Array.isArray(payload) ? payload.map(strip) : strip(payload)
}

/**
 * Sends the webhook body to the CFF backend, which keeps only the contest
 * taps in it. Tries twice. Returns true once CFF has stored them.
 */
export async function forwardContestTaps(payload) {
  const key = process.env.CFF_TAP_WEBHOOK_KEY
  if (!key) {
    console.error('[cff-contest] CFF_TAP_WEBHOOK_KEY is not set: contest tap dropped')
    return false
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(process.env.CFF_TAP_WEBHOOK_URL || DEFAULT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
        body: JSON.stringify(payload ?? {}),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return true
      console.error(`[cff-contest] CFF answered ${res.status} (attempt ${attempt})`)
    } catch (err) {
      console.error(`[cff-contest] could not reach CFF (attempt ${attempt}):`, err.message)
    }
  }
  return false
}
