import { Navigate, useParams } from 'react-router-dom'

/**
 * /w/<slug>: the short links in WhatsApp template buttons (https://chennairiceindustries.com/w/{{1}}).
 * The start of the slug says where to go; every link carries utm_source=whatsapp so the visit and any
 * order are credited to WhatsApp in Analyst, Ad campaigns and Journeys.
 */
const ROUTES = [
  ['shop-', '/rice-products', 'wa_bot'],
  ['spin-bot', '/', 'wa_bot'],
  ['spin-', '/rice-products', 'wa_spin'],
  ['ref-', '/refer', 'wa_referral'],
  ['reward-', '/rice-products', 'wa_referral_reward'],
  ['reorder-', '/rice-products', 'wa_restock'],
  ['back-', '/rice-products', 'wa_winback'],
  ['cart-', '/cart', 'wa_cart'],
  ['review-', '/review', 'wa_review'],
  ['track-', '/track-order', 'wa_order'],
]

export function shortLinkTarget(slug) {
  const s = String(slug || '')
  const [prefix, path, campaign] = ROUTES.find(([p]) => s.toLowerCase().startsWith(p)) || ['', '/', 'wa_link']
  const ref = s.slice(prefix.length)
  const q = new URLSearchParams({ utm_source: 'whatsapp', utm_medium: 'message', utm_campaign: campaign })
  if (ref && prefix === 'track-') q.set('order', ref)
  // review-<order number>.<token> → the signed review form; cart-<token> → the saved cart at checkout.
  if (ref && prefix === 'review-') { const [o, t] = ref.split('.'); q.set('o', o); if (t) q.set('t', t) }
  if (ref && prefix === 'cart-') return `/checkout?resume=${encodeURIComponent(ref)}&${q}`
  return `${path}?${q}`
}

let recorded = ''

/** spin-<CODE>: the prize code goes into checkout, so it is applied without typing it (Nov 2026). */
export function spinCodeFromSlug(slug) {
  const m = /^spin-(?!bot$)([A-Za-z0-9-]{4,40})$/i.exec(String(slug || ''))
  return m ? m[1].toUpperCase() : ''
}

export default function ShortLink() {
  const { slug } = useParams()
  const code = spinCodeFromSlug(slug)
  // The same key CheckoutPage reads (DISCOUNT_CODE_KEY); storage may be blocked, then they use Copy code.
  if (code) { try { window.sessionStorage.setItem('cr.checkout.code', code) } catch { /* ignore */ } }
  // The tap, for the Spin reminder report (once per page load; React may render this twice).
  if (slug && recorded !== slug) {
    recorded = slug
    fetch('/api/w/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }), keepalive: true }).catch(() => {})
  }
  return <Navigate to={shortLinkTarget(slug)} replace />
}
