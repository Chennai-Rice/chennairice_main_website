// Google Ads lead events for Google Tag Manager (GTM-K2RL4JBL), agreed with the Google Ads manager (19 Nov 2026).
//
// The site only pushes the event into dataLayer; GTM listens (Custom Event triggers) and fires the Google Ads
// conversion tags with their labels, under Consent Mode. Nothing personal is pushed (no name, phone or email).
//   whatsapp_click     a tap on a link that opens a WhatsApp chat with our number   → WhatsApp lead (Primary)
//   phone_call_click   a tap on a tel: link                                         → Call click
//   contest_entry      the Super Slogan Contest sign-up, after the server accepted it → Contest entry
//   generate_lead      the bulk / distributor enquiry form, after the server accepted it → Distributor lead

export const COMPANY_WHATSAPP = '917066646667'

/** Push one event for GTM. */
export function pushAdEvent(event, data = {}) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, page_path: window.location.pathname, ...data })
}

/** A link that opens a WhatsApp chat with Chennai Rice (not a "share on WhatsApp" link to someone else). */
export function isCompanyWhatsApp(href) {
  let url
  try { url = new URL(href, window.location.href) } catch { return false }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'wa.me') return url.pathname.replace(/\D/g, '') === COMPANY_WHATSAPP
  if (host === 'api.whatsapp.com' || host === 'web.whatsapp.com' || url.protocol === 'whatsapp:') {
    return (url.searchParams.get('phone') || '').replace(/\D/g, '') === COMPANY_WHATSAPP
  }
  return false
}

/** Where on the page the link sits: a data-track-location on it or a parent, else header / footer / main. */
function locationOf(el) {
  const tagged = el.closest('[data-track-location]')
  if (tagged) return tagged.getAttribute('data-track-location')
  if (el.closest('header, .navbar, nav')) return 'header'
  if (el.closest('footer')) return 'footer'
  if (el.closest('[role="dialog"], .chat, .chatbot')) return 'popup'
  return 'page'
}

let installed = false

/** One listener for the whole site: every WhatsApp and call link, wherever it is, now or added later. */
export function installAdClickEvents() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('click', (e) => {
    const a = e.target?.closest?.('a[href]')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (/^tel:/i.test(href)) {
      pushAdEvent('phone_call_click', { phone_number: href.replace(/^tel:/i, '').replace(/[^\d+]/g, ''), button_location: locationOf(a) })
    } else if (isCompanyWhatsApp(href)) {
      // The link without its pre-filled message.
      let link = href
      try { const u = new URL(href, window.location.href); link = u.origin + u.pathname } catch { /* keep */ }
      pushAdEvent('whatsapp_click', { link_url: link, button_location: locationOf(a) })
    }
  }, { capture: true, passive: true })
}
