// Mobile OTP for the Super Slogan Contest sign-up shown to visitors from a
// Meta or Google ad, sent and checked by MSG91 (msg91.com).
//
//   MSG91_AUTH_KEY          the account's auth key (Secret Manager, never in git)
//   MSG91_OTP_TEMPLATE_ID   the DLT-approved OTP template (functions/.env)
//   MSG91_BASE_URL          optional, defaults to https://control.msg91.com
//
// Without an auth key and template the OTP step is switched off and the form
// saves sign-ups as before (so local testing needs no SMS account).
import { httpError } from './util.js'

const PER_PHONE_15_MIN = 3
const PER_PHONE_DAY = 8

export function otpEnabled() {
  return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID)
}

const base = () => (process.env.MSG91_BASE_URL || 'https://control.msg91.com').replace(/\/$/, '')

async function msg91(method, path, params) {
  const url = `${base()}${path}?${new URLSearchParams(params)}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { authkey: process.env.MSG91_AUTH_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    console.error('[otp] MSG91 unreachable:', err.message)
    throw httpError('MSG91 unreachable', { status: 502, publicMessage: 'Could not send the OTP just now. Please try again in a minute.' })
  }
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && String(data.type).toLowerCase() === 'success', data }
}

/** Limits per mobile number, on top of the per-visitor limit on the route. */
async function checkLimits(db, phone) {
  const { rows: [r] } = await db.query(
    `select count(*) filter (where created_at > now() - interval '15 minutes')::int as recent,
            count(*) filter (where created_at > now() - interval '1 day')::int as today
       from contest_otp_requests where phone = $1`,
    [phone]
  )
  if (r.recent >= PER_PHONE_15_MIN || r.today >= PER_PHONE_DAY) {
    throw httpError('OTP limit', { status: 429, publicMessage: 'Too many OTPs for this number. Please try again later.' })
  }
}

/** Sends (or, with resend, re-sends) the OTP to a 10-digit Indian mobile. */
export async function sendOtp(db, phone, { resend = false, ip = '' } = {}) {
  if (!otpEnabled()) return { otpRequired: false }
  await checkLimits(db, phone)
  await db.query('insert into contest_otp_requests (phone, ip, kind) values ($1, $2, $3)', [phone, String(ip).slice(0, 64), resend ? 'resend' : 'send'])
  const mobile = '91' + phone
  const r = resend
    ? await msg91('GET', '/api/v5/otp/retry', { mobile, retrytype: 'text' })
    : await msg91('POST', '/api/v5/otp', { template_id: process.env.MSG91_OTP_TEMPLATE_ID, mobile, otp_length: '6', otp_expiry: '10' })
  if (!r.ok) {
    console.error('[otp] MSG91 refused:', JSON.stringify(r.data).slice(0, 200))
    throw httpError('OTP not sent', { status: 502, publicMessage: 'Could not send the OTP just now. Please check the number and try again.' })
  }
  return { otpRequired: true, sent: true }
}

/** True when MSG91 confirms the OTP for this mobile. */
export async function verifyOtp(phone, otp) {
  const code = String(otp ?? '').replace(/\D/g, '')
  if (!/^\d{4,8}$/.test(code)) throw httpError('Bad OTP', { publicMessage: 'Please enter the OTP sent to your mobile.' })
  const r = await msg91('GET', '/api/v5/otp/verify', { mobile: '91' + phone, otp: code })
  if (!r.ok) throw httpError('Wrong OTP', { publicMessage: 'That OTP is not right or has expired. Please check it, or resend.' })
  return true
}
