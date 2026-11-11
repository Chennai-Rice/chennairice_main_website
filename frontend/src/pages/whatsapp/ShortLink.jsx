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
  if (ref && (prefix === 'review-' || prefix === 'track-')) q.set('order', ref)
  return `${path}?${q}`
}

export default function ShortLink() {
  const { slug } = useParams()
  return <Navigate to={shortLinkTarget(slug)} replace />
}
