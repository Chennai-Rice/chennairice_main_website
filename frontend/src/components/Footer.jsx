import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FOOTER } from '../data/content.js'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './footer.css'

const Social = {
  facebook: (
    <path
      d="M13.5 8H12c-1 0-1.5.5-1.5 1.5V11H13l-.4 2.5h-2.1V20H8v-6.5H6V11h2V9.2C8 7 9.3 5.8 11.3 5.8c.9 0 1.7.1 2.2.15z"
      fill="currentColor"
    />
  ),
  instagram: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="4.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="16.2" cy="7.9" r="1" fill="currentColor" />
    </>
  ),
  youtube: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" rx="3.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M10.4 9.6l4.4 2.4-4.4 2.4z" fill="currentColor" />
    </>
  ),
}

/** Gold wheat glyph above "Stay Connected". */
const WheatMark = () => (
  <svg width="20" height="26" viewBox="0 0 22 30" fill="none" aria-hidden="true">
    <path d="M11 29V11" stroke="var(--gold-deep)" strokeWidth="1.4" strokeLinecap="round" />
    {[3, 9, 15].map(y => (
      <g key={y}>
        <path d={`M11 ${y}c-5 1-7 4-7 7 4 0 7-3 7-7z`} fill="var(--gold-deep)" />
        <path d={`M11 ${y}c5 1 7 4 7 7-4 0-7-3-7-7z`} fill="var(--gold)" />
      </g>
    ))}
  </svg>
)

/** Gold rule with a diamond, under each column heading. */
const HeadRule = () => (
  <svg width="56" height="9" viewBox="0 0 60 9" fill="none" aria-hidden="true" className="foot-head-rule">
    <path d="M0 4.5h23M37 4.5h23" stroke="var(--gold)" strokeWidth="1" />
    <path d="M30 1l3.5 3.5L30 8l-3.5-3.5z" fill="var(--gold)" />
  </svg>
)

/** Laurel wreath flanking the ESTD year. */
const Laurel = ({ flip = false }) => (
  <svg
    width="26"
    height="40"
    viewBox="0 0 30 46"
    fill="none"
    stroke="var(--gold-soft)"
    strokeWidth="1.1"
    strokeLinecap="round"
    aria-hidden="true"
    style={flip ? { transform: 'scaleX(-1)' } : undefined}
  >
    <path d="M24 3C11 8 5 17 5 26c0 7 3.5 13 9.5 16.5" />
    {[7, 13, 19, 25, 31, 37].map((y, i) => (
      <ellipse
        key={y}
        cx={18 - i * 2.4}
        cy={y}
        rx="4.6"
        ry="2.1"
        transform={`rotate(${-46 + i * 8} ${18 - i * 2.4} ${y})`}
      />
    ))}
  </svg>
)

/** Wheat sprig either side of the motto. */
const Sprig = ({ flip = false }) => (
  <svg
    width="40"
    height="13"
    viewBox="0 0 44 14"
    fill="none"
    aria-hidden="true"
    style={flip ? { transform: 'scaleX(-1)' } : undefined}
  >
    <path d="M2 7h14" stroke="var(--gold-soft)" strokeWidth="1.2" strokeLinecap="round" />
    {[18, 26, 34].map((x, i) => (
      <path key={x} d={`M${x} 7l7-4v8z`} fill="var(--gold-soft)" opacity={1 - i * 0.18} />
    ))}
  </svg>
)

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
      {/* The artwork is the backdrop; everything below is laid over it.
          WebP with a PNG fallback for older browsers. */}
      <picture className="foot-art">
        <source srcSet="/assets/footer.webp" type="image/webp" />
        <img
          src="/assets/footer.png"
          alt=""
          aria-hidden="true"
        />
      </picture>

      {/* --- upper block, sitting in the artwork's sky --- */}
      <div className="container foot-top">
        <div className="foot-connect">
          <WheatMark />
          <h3 className="foot-connect-title">{FOOTER.newsletter.title}</h3>
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
            <button type="submit" aria-label="Subscribe">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 3L3 10.5l7 2.5 2.5 7L21 3z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path d="M10 13.5L21 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
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
            <div className="foot-col" key={col.head}>
              <h4 className="foot-head">{col.head}</h4>
              <HeadRule />
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* --- lower block, sitting in the artwork's maroon band --- */}
      <div className="foot-band">
        <div className="container foot-crest">
          <div className="foot-estd">
            <Laurel />
            <span className="foot-estd-text">
              <small>Estd.</small>
              <strong>{FOOTER.estd}</strong>
            </span>
            <Laurel flip />
          </div>

          <p className="foot-copy">
            {FOOTER.copyright}
            <button type="button" className="foot-cookie-link" onClick={reopen}>
              Cookie Preferences
            </button>
          </p>

          <div className="foot-follow">
            <span className="foot-follow-label">Follow Us</span>
            <div className="foot-social">
              {['facebook', 'instagram', 'youtube'].map(k => (
                <a key={k} href="#" className="foot-soc" aria-label={k}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {Social[k]}
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="foot-motto">
          <Sprig />
          <span>{FOOTER.motto}</span>
          <Sprig flip />
        </div>
      </div>
    </footer>
  )
}
