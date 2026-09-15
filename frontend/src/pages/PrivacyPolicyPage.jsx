import Ornament from '../components/Ornament.jsx'
import { POLICY_LAST_UPDATED, POLICY_INTRO, POLICY_SECTIONS, POLICY_CONTACT } from '../data/privacyPolicy.js'
import './page.css'
import './legal.css'

export default function PrivacyPolicyPage() {
  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Legal</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="legal-updated">Last Updated: {POLICY_LAST_UPDATED}</p>

        <article className="legal-body">
          {POLICY_INTRO.map((para, i) => (
            <p key={i}>{para}</p>
          ))}

          {POLICY_SECTIONS.map(section => (
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
            <h2>{POLICY_CONTACT.heading}</h2>
            <p>{POLICY_CONTACT.intro}</p>
            <p>
              {POLICY_CONTACT.companyName}
              <br />
              Website: {POLICY_CONTACT.website}
              <br />
              Privacy email:{' '}
              <a href={`mailto:${POLICY_CONTACT.email}`}>{POLICY_CONTACT.email}</a>
            </p>
            <p>
              Address:{' '}
              {POLICY_CONTACT.address.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < POLICY_CONTACT.address.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          </section>
        </article>
      </div>
    </main>
  )
}
