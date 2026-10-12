import SectionHead from './SectionHead.jsx'
import { HOME_FAQS } from '../data/content.js'
import './homefaq.css'

const FAQ_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: HOME_FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
})

/** Home page FAQs: an accordion, the first answer open. */
export default function HomeFaq() {
  return (
    <section className="home-faq" id="faqs">
      <div className="container home-faq-inner">
        <SectionHead label="Good to Know" title="FAQs" />
        <div className="home-faq-list">
          {HOME_FAQS.map((f, i) => (
            <details className="home-faq-item" key={f.q} open={i === 0}>
              <summary>
                <h3 className="home-faq-q">{f.q}</h3>
                <span className="home-faq-icon" aria-hidden="true" />
              </summary>
              <p className="home-faq-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_SCHEMA }} />
    </section>
  )
}
