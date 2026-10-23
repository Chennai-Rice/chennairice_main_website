// Where this visitor came from, for the "sales by source" report.
//
// On landing, the ad tags in the link (utm_*, Meta fbclid, Google gclid) and
// the referring site are noted. The latest non-direct landing is remembered
// for 30 days in this browser and sent with the order, so a customer who
// clicks an ad and orders the next day is still counted for that ad. A plain
// direct visit never overwrites an ad visit. The landing itself is counted
// once per visit (counts only: nothing about the visitor is sent).
//
// This is a note about the sale, not a tracker: it stays on this site, goes
// to no third party and identifies no one, so it runs whatever the cookie
// choice (the Meta Pixel and Google Analytics still wait for consent).

const KEY = 'cr.attribution'
const COUNTED = 'cr.attribution.counted'
const FROM_AD = 'cr.attribution.fromAd'
const KEEP_DAYS = 30
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

// Same rules as classify() in backend/lib/sales/attribution.js: a Google Ads
// click (gclid, or a Google source with a paid medium), or a Meta ad
// (Facebook / Instagram / Meta link or referrer with a paid medium).
const PAID = /^(paid|cpc|ppc|ads?|paid[_-]?social|paidsocial|paid[_-]?search|display|sponsored)$/i
function isPaidAd(a) {
  const s = (a.utm_source || '').toLowerCase()
  const paid = PAID.test(a.utm_medium || '')
  if (a.gclid) return true
  if (!paid) return false
  let host = ''
  try { host = a.referrer ? new URL(a.referrer).hostname : '' } catch { /* none */ }
  return (
    /^(google|adwords|googleads|google_ads)$/.test(s) ||
    /^(ig|instagram|fb|facebook|meta)$/.test(s) ||
    /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me)$/.test(host) ||
    Boolean(a.fbclid)
  )
}

// A WhatsApp link (utm_source=whatsapp / wa, or WhatsApp as the referrer). These
// visitors get the same contest sign-up form as ad visitors.
function isWhatsApp(a) {
  const s = (a.utm_source || '').toLowerCase()
  let host = ''
  try { host = a.referrer ? new URL(a.referrer).hostname : '' } catch { /* none */ }
  return /^(whatsapp|wa)$/.test(s) || /(^|\.)(whatsapp\.com|wa\.me)$/.test(host)
}

/** Did this browsing session start from a Meta or Google ad, or a WhatsApp link? */
export function isAdVisit() {
  try {
    return window.sessionStorage.getItem(FROM_AD) === '1'
  } catch {
    return false
  }
}

function readStored() {
  try {
    const a = JSON.parse(window.localStorage.getItem(KEY) || 'null')
    if (!a?.at || Date.now() - new Date(a.at).getTime() > KEEP_DAYS * 864e5) return null
    return a
  } catch {
    return null
  }
}

/** Note this landing. Call once when the site first loads. */
export function captureAttribution() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const a = {}
  for (const p of PARAMS) {
    const v = url.searchParams.get(p)
    if (v) a[p] = v.slice(0, 120)
  }
  // The QR code at an expo opens /expo: that visit (and any order after it) counts as "Expo QR".
  if (url.pathname.replace(/\/+$/, '') === '/expo' && !a.utm_source) {
    a.utm_source = 'expo'
    a.utm_medium = 'qr'
    a.utm_campaign = (url.searchParams.get('c') || 'expo').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) || 'expo'
  }
  if (url.searchParams.get('fbclid')) a.fbclid = true
  if (url.searchParams.get('gclid') || url.searchParams.get('gbraid') || url.searchParams.get('wbraid')) a.gclid = true
  let ref = ''
  try {
    const r = document.referrer ? new URL(document.referrer) : null
    if (r && r.hostname !== window.location.hostname) ref = r.origin + '/'
  } catch { /* no usable referrer */ }
  if (ref) a.referrer = ref
  // This visit came from a paid ad: remembered for this browsing session
  // (the contest popup is shown only to these visitors).
  if (isPaidAd(a) || isWhatsApp(a)) {
    try { window.sessionStorage.setItem(FROM_AD, '1') } catch { /* popup stays off */ }
  }
  if (!Object.keys(a).length) return // a direct visit keeps any earlier ad visit
  a.landing = url.pathname
  a.at = new Date().toISOString()
  try {
    window.localStorage.setItem(KEY, JSON.stringify(a))
  } catch { /* storage blocked: the order is counted as direct */ }

  // Count the landing once per visit.
  try {
    if (window.sessionStorage.getItem(COUNTED)) return
    window.sessionStorage.setItem(COUNTED, '1')
  } catch { /* count it anyway */ }
  fetch('/api/traffic/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(a),
    keepalive: true,
  }).catch(() => {})
}

/** What to send with the order (null = direct). */
export function currentAttribution() {
  if (typeof window === 'undefined') return null
  return readStored()
}
