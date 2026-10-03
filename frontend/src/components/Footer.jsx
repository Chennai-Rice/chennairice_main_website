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

      <div className="container foot-main">
        <Link to="/" className="foot-logo" aria-label="Chennai Rice Industries — home">
          <img src="/assets/logo-footer-v1.png" alt="Chennai Rice Industries" width="408" height="440" />
        </Link>

        <div className="foot-connect">
          <h2 className="foot-title">{FOOTER.newsletter.title}</h2>
          <span className="foot-rule" aria-hidden="true" />
          <p className="foot-connect-text">{FOOTER.newsletter.text}</p>

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

        <div className="foot-follow">
          <h2 className="foot-title">Follow Us</h2>
          <span className="foot-rule" aria-hidden="true" />
          <ul className="foot-social">
            {FOOTER.social.map(({ key, href, label }) => (
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
        </div>
      </div>

      <img className="foot-sprig" src="/assets/footer-sprig.png" alt="" aria-hidden="true" />

      <div className="foot-bar">
        <div className="container foot-bar-inner">
          {/* Year from the clock, so it never goes stale. */}
          <p>
            &copy; {new Date().getFullYear()} {FOOTER.copyright}
            <span className="foot-bar-sep" aria-hidden="true">|</span>
            All rights reserved.
          </p>
          <button type="button" className="foot-cookie" onClick={reopen}>
            Cookie Preferences
          </button>
        </div>
      </div>
    </footer>
  )
}
