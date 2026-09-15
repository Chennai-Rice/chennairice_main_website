import Ornament from '../components/Ornament.jsx'
import { TERMS_LAST_UPDATED, TERMS_INTRO, TERMS_SECTIONS, TERMS_CONTACT } from '../data/termsConditions.js'
import './page.css'
import './legal.css'

export default function TermsPage() {
  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Legal</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">Terms and Conditions</h1>
        <p className="legal-updated">Last Updated: {TERMS_LAST_UPDATED}</p>

        <article className="legal-body">
          {TERMS_INTRO.map((para, i) => (
            <p key={i}>{para}</p>
          ))}

          {TERMS_SECTIONS.map(section => (
            <section key={section.title} className="legal-section">
              <h2>{section.title}</h2>
              {section.paragraphs?.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {section.list && (
                <ul>
                  {section.list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
              {section.after?.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </section>
          ))}

          <section className="legal-section legal-contact">
            <h2>{TERMS_CONTACT.heading}</h2>
            <p>{TERMS_CONTACT.intro}</p>
            <p>
              {TERMS_CONTACT.companyName}
              <br />
              {TERMS_CONTACT.address.map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
              Email: <a href={`mailto:${TERMS_CONTACT.email}`}>{TERMS_CONTACT.email}</a>
            </p>
          </section>

          <p className="legal-copyright">© {TERMS_CONTACT.companyName}. All Rights Reserved.</p>
        </article>
      </div>
    </main>
  )
}
