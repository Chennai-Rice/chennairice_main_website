import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FOOTER } from '../data/content.js'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './footer.css'

/* Thin-line marks on one 24px grid. Only networks with a real profile URL in
   FOOTER.social are drawn — an icon pointing at "#" reads as a broken site. */
const Social = {
  instagram: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="4.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="16.2" cy="7.9" r="1" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      d="M13.5 8H12c-1 0-1.5.5-1.5 1.5V11H13l-.4 2.5h-2.1V20H8v-6.5H6V11h2V9.2C8 7 9.3 5.8 11.3 5.8c.9 0 1.7.1 2.2.15z"
      fill="currentColor"
    />
  ),
  linkedin: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M8.6 10.6v5M8.6 8.2v.1M11.4 15.6v-5m0 2.4c0-1.5.9-2.6 2.2-2.6s1.9.9 1.9 2.4v2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </>
  ),
  youtube: (
    <>
      <rect x="3.8" y="6.5" width="16.4" height="11" rx="3.2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10.5 9.6v4.8l4.1-2.4z" fill="currentColor" />
    </>
  ),
}

export default function Footer() {
  const { reopen } = useCookieConsent()
  const [email, setEmail] = useState('')
  const [state, setState] = useState(null) // 'ok' | 'bad'

  const subscribe = e => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState('bad')
      return
    }
    // No mailing-list backend is connected yet — this records the address so
    // the control is testable and shows the confirmation state.
    // eslint-disable-next-line no-console
    console.info('Newsletter signup (not yet sent to a server):', value)
    setState('ok')
    setEmail('')
  }

  return (
    <footer className="foot" id="contact">
      {/* The landscape and gold wave from the footer artwork. Only the
          decoration is used: the artwork's painted text and columns are
          replaced by the live content below, so every link is real. */}
      <div className="foot-art" aria-hidden="true">
        <picture>
          <source srcSet="/assets/footer-band.webp" type="image/webp" />
          <img src="/assets/footer-band.png" alt="" />
        </picture>
      </div>

      {/* Stay Connected: one band across the top, text on the left, the form on the right. */}
      <div className="container foot-news">
        <div className="foot-news-copy">
          <h2 className="foot-title">{FOOTER.newsletter.title}</h2>
          <p className="foot-connect-text">{FOOTER.newsletter.text}</p>
        </div>
        <div className="foot-news-form">
          <form className="foot-subscribe" onSubmit={subscribe} noValidate>
            <input
              type="email"
              value={email}
              placeholder={FOOTER.newsletter.placeholder}
              aria-label="Email address"
              aria-invalid={state === 'bad'}
              onChange={e => {
                setEmail(e.target.value)
                setState(null)
              }}
            />
            <button type="submit">Subscribe</button>
          </form>
          {state === 'bad' && <p className="foot-note foot-note-bad">Please enter a valid email address.</p>}
          {state === 'ok' && (
            <p className="foot-note" role="status">
              Thank you — saved. No mailing list is connected yet, so nothing was sent.
            </p>
          )}
        </div>
      </div>

      {/* Brand | links | Reach Us. */}
      <div className="container foot-main">
        <div className="foot-brand">
          <Link to="/" className="foot-logo" aria-label="Chennai Rice Industries — home">
            <img src="/assets/logo-footer-v1.png" alt="Chennai Rice Industries" width="408" height="440" />
          </Link>

          <h2 className="foot-label">Follow Us</h2>
          <ul className="foot-social">
            {FOOTER.social.filter((s) => s.href).map(({ key, href, label }) => (
              <li key={key}>
                <a
                  className="foot-soc"
                  href={href}
                  aria-label={label}
                  target="_blank"
                  /* noopener is the security half (the opened tab cannot reach
                     back through window.opener); noreferrer keeps the
                     referrer header off the request. */
                  rel="noopener noreferrer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {Social[key]}
                  </svg>
                </a>
              </li>
            ))}
          </ul>

          {/* Food safety licence: the FSSAI logo on a white badge (it is not
              legible on the maroon footer) with the licence number. */}
          <div className="foot-fssai">
            <img src="/assets/fssai-logo.png" alt="FSSAI" width="835" height="458" loading="lazy" />
            <p>
              <span>Lic. No.</span>
              <strong>{FOOTER.fssai}</strong>
            </p>
          </div>
        </div>

        <div className="foot-cols">
          {FOOTER.columns.map(col => (
            <nav className="foot-col" key={col.head} aria-labelledby={`foot-${col.head}`}>
              <h2 className="foot-title" id={`foot-${col.head}`}>
                {col.head}
              </h2>
              <span className="foot-rule" aria-hidden="true" />
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Reach Us: the company, address and contacts, then the mill on Google Maps. */}
        <div className="foot-reach">
          <h2 className="foot-title">Reach Us</h2>
          <span className="foot-rule" aria-hidden="true" />
          <address className="foot-company">
            <strong className="foot-company-name">{FOOTER.company}</strong>
            <span className="foot-line">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.3" /></svg>
              <span>{FOOTER.address.join(' ')}</span>
            </span>
            <span className="foot-line">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" /></svg>
              <a href={`tel:${FOOTER.phone.replace(/\s/g, '')}`}>{FOOTER.phone.replace('+91 ', '')}</a>
            </span>
            <span className="foot-line">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></svg>
              <a href={`mailto:${FOOTER.email}`}>{FOOTER.email}</a>
            </span>
            <span className="foot-gstin">GSTIN {FOOTER.gstin}</span>
          </address>

          <div className="foot-map">
            <iframe
              title="Chennai Rice Industries on Google Maps"
              src={FOOTER.maps.embed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a className="foot-map-open" href={FOOTER.maps.profile} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <img className="foot-sprig" src="/assets/footer-sprig.png" alt="" aria-hidden="true" />

      <div className="foot-bar">
        <div className="container foot-bar-inner">
          {/* Year from the clock, so it never goes stale. */}
          <p>
            &copy; {new Date().getFullYear()} {FOOTER.brand}. All rights reserved.
          </p>
          <div className="foot-bar-links">
            <Link to="/privacy">Privacy Policy</Link>
            <button type="button" className="foot-cookie" onClick={reopen}>
              Cookie Preferences
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
