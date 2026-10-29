import { Link } from 'react-router-dom'
import SectionHead from './SectionHead.jsx'
import { HOME_FAQS } from '../data/content.js'
import './homefaq.css'

/** The answer, with `inline.text` (where it appears) as a link. */
function Answer({ f }) {
  const at = f.inline ? f.a.indexOf(f.inline.text) : -1
  if (at < 0) return f.a
  return (
    <>
      {f.a.slice(0, at)}
      <Link className="home-faq-inline" to={f.inline.to}>{f.inline.text}</Link>
      {f.a.slice(at + f.inline.text.length)}
    </>
  )
}

/**
 * Home page FAQs: an accordion, the first answer open. Their FAQPage
 * structured data is in the pre-rendered home page (scripts/prerender-head.mjs).
 */
export default function HomeFaq() {
  return (
    <section className="home-faq" id="faqs">
      <div className="container home-faq-inner">
        <SectionHead label="Good to Know" title="Chennai Rice – Frequently Asked Questions" />
        <div className="home-faq-list">
          {HOME_FAQS.map((f, i) => (
            <details className="home-faq-item" key={f.q} open={i === 0}>
              <summary>
                <h3 className="home-faq-q">{f.q}</h3>
                <span className="home-faq-icon" aria-hidden="true" />
              </summary>
              <p className="home-faq-a"><Answer f={f} /></p>
              {f.links?.map((l) => (l.to
                ? <Link className="home-faq-link" key={l.label} to={l.to}>{l.label} →</Link>
                : <a className="home-faq-link" key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">{l.label} →</a>))}
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
