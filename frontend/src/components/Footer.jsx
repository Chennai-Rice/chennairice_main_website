import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FOOTER } from '../data/content.js'
import { useCookieConsent } from '../hooks/useCookieConsent.jsx'
import './footer.css'

/* The badges painted into the footer artwork, in the order they are drawn.
   Each needs a matching .foot-hotspot--<key> rule in footer.css giving its
   position. Change the artwork and these two lists change together. */
const PAINTED_BADGES = ['instagram', 'facebook']

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
  /* Used on phones, where the artwork is not shown and real icons are drawn. */
  whatsapp: (
    <path
      d="M12 4.6a7.3 7.3 0 00-6.2 11.1L4.8 19.4l3.8-1a7.3 7.3 0 103.4-13.8zM9.4 9.1c.15-.35.3-.35.5-.36h.4c.15 0 .33 0 .5.4l.6 1.5c.05.15.1.3 0 .5l-.35.45c-.1.15-.23.3-.1.55a6 6 0 002.9 2.5c.25.1.4.1.55-.05l.6-.7c.15-.2.3-.15.5-.08l1.4.7c.2.1.35.15.4.25a1.8 1.8 0 01-.13.98c-.2.3-.9.85-1.65.85-1.2 0-3.2-1-4.65-2.5A9 9 0 019.1 11a2.5 2.5 0 01.3-1.9z"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      fill="none"
    />
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
/* A plain hairline. It used to be an SVG carrying a small diamond, which read
   as a speck at this width — and an SVG cannot be restyled into a 1px rule
   with CSS alone, since it paints its own content over any background. */
const HeadRule = () => <span className="foot-head-rule" aria-hidden="true" />

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
      {/* --- upper block, sitting in the artwork's sky --- */}
      <div className="container foot-top">
        <div className="foot-connect">
          {/* Icon beside the heading rather than stacked above it, so the
              block starts higher and the heading sits in the clear sky
              instead of down among the palms. */}
          <div className="foot-connect-head">
            <WheatMark />
            <h3 className="foot-connect-title">{FOOTER.newsletter.title}</h3>
          </div>
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
            {/* Labelled rather than icon-only: a lone paper-plane glyph beside
                a text field reads as decoration, and left the control with no
                accessible name beyond its aria-label. */}
            <button type="submit">
              Subscribe
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

      {/* The painting, with its click targets inside the same box. On desktop
          it is the backdrop the text above sits on; on tablets and phones it
          becomes a band of its own below the text (see footer.css).

          The hotspots lie exactly over the Instagram and Facebook badges
          painted into the artwork. Living inside the artwork's own box means
          they follow the picture in every layout, rather than being pinned
          to the footer's edge and trusting the picture to be there too.
          Phones crop the badges out of view and show real icons in
          .foot-follow instead. */}
      <div className="foot-art">
        <picture>
          <source srcSet="/assets/footer-v8.webp" type="image/webp" />
          <img src="/assets/footer-v8.png" alt="" aria-hidden="true" />
        </picture>
        <div className="foot-hotspots">
          {/* Only the networks the artwork actually draws a badge for.
              Anything else in FOOTER.social has nowhere to sit, and a hotspot
              without a matching --key rule would land in the top-left corner. */}
          {FOOTER.social.filter(s => PAINTED_BADGES.indexOf(s.key) !== -1).map(({ key, href, label }) => (
            <a
              key={key}
              className={`foot-hotspot foot-hotspot--${key}`}
              href={href}
              aria-label={label}
              target="_blank"
              /* noopener is the security half (the opened tab cannot reach
                 back through window.opener); noreferrer keeps the referrer
                 header off the request. */
              rel="noopener noreferrer"
            />
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

          <div className="foot-follow">
            <span className="foot-follow-label">Follow Us</span>
            <div className="foot-social">
              {/* Driven by FOOTER.social, so adding a network is a data change
                  and no account is ever represented by a dead "#" link. */}
              {FOOTER.social.map(({ key, href, label }) => (
                <a
                  key={key}
                  href={href}
                  className="foot-soc"
                  aria-label={label}
                  target="_blank"
                  // noopener is the security half (the opened tab cannot reach
                  // back through window.opener); noreferrer keeps the
                  // referrer header off the request.
                  rel="noopener noreferrer"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {Social[key]}
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

      {/* The artwork carries the badge, the icons and the motto, but nothing
          for the company line or the cookie control. Rather than crowd them
          into the painted band, they sit in a plain strip underneath it, in
          the artwork's own bottom-edge colour so the two read as one block. */}
      <div className="foot-legal">
        <p className="container foot-legal-inner">
          {FOOTER.copyright}
          <button type="button" className="foot-cookie-link" onClick={reopen}>
            Cookie Preferences
          </button>
        </p>
      </div>
    </footer>
  )
}
