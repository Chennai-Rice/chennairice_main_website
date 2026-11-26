import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../shop/hooks/useCart.jsx'
import { COMPANY_WHATSAPP } from '../services/adEvents.js'
import './actionbar.css'

/**
 * The sticky Buy + WhatsApp bar on phones (Google Ads requirement B1, Nov 2026): "Buy now" to the shop and
 * "Order on WhatsApp" with a pre-filled message. Every page of the shop except where a bar of its own is
 * already at the bottom: product pages (their buy bar carries a WhatsApp button), the cart, checkout, and
 * whenever the "Proceed to cart" pill is showing. The WhatsApp tap is counted as whatsapp_click
 * (button_location sticky_bar) by services/adEvents.js; phones only (CSS).
 */
export const whatsappOrderLink = (text) => `https://wa.me/${COMPANY_WHATSAPP}?text=${encodeURIComponent(text)}`

const HIDDEN = [/^\/products\//, /^\/cart/, /^\/checkout/, /^\/order-confirmed/, /^\/review/, /^\/track-order/]

export default function ActionBar() {
  const { pathname } = useLocation()
  const { count } = useCart()
  if (count > 0 || HIDDEN.some((re) => re.test(pathname))) return null
  return (
    <div className="site-actionbar" data-track-location="sticky_bar">
      {/* Click to call: counted as phone_call_click (button_location sticky_bar) by services/adEvents.js. */}
      <a className="site-actionbar-call" href="tel:+917066646667" aria-label="Call Chennai Rice on 70666 46667">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.6 3.5h2.6l1.4 3.7-1.8 1.3a11 11 0 0 0 6.7 6.7l1.3-1.8 3.7 1.4v2.6a1.8 1.8 0 0 1-2 1.8A15.6 15.6 0 0 1 4.8 5.5a1.8 1.8 0 0 1 1.8-2z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </a>
      <Link className="site-actionbar-buy" to="/rice-products">Buy now</Link>
      <a className="site-actionbar-wa" href={whatsappOrderLink('Hi Chennai Rice, I would like to order rice.')} target="_blank" rel="noopener noreferrer">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" />
        </svg>
        Order on WhatsApp
      </a>
    </div>
  )
}
