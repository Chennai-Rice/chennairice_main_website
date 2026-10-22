import { Link } from 'react-router-dom'
import Ornament from '../components/Ornament.jsx'
import { POLICY_CONTACT, SHIPPING_POLICY, REFUND_POLICY } from '../data/policies.js'
import './page.css'
import './legal.css'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { PAGE_META } from '../seo.js'

const POLICIES = {
  shipping: { meta: PAGE_META.shipping, policy: SHIPPING_POLICY, helpHeading: 'Need help?' },
  refund: { meta: PAGE_META.refund, policy: REFUND_POLICY, helpHeading: '8. Help and complaints' },
}

/** The Shipping Policy and the Return & Refund Policy (same layout as the Terms page, plus tables). */
export default function PolicyPage({ kind }) {
  const { meta, policy, helpHeading } = POLICIES[kind]
  usePageMeta(meta.title, meta.description)
  return (
    <main className="page">
      <div className="container page-inner page-inner--wide">
        <div className="section-label">
          <Ornament />
          <span>Policies</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">{meta.h1}</h1>
        <p className="legal-updated">Last Updated: {policy.lastUpdated}</p>

        <article className="legal-body">
          {policy.intro.map((para, i) => (
            <p key={i}>{para}</p>
          ))}

          {policy.sections.map((section) => (
            <section key={section.title} className="legal-section">
              <h2>{section.title}</h2>
              {section.paragraphs?.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {section.table && (
                <div className="legal-table-wrap">
                  <table className="legal-table">
                    <thead>
                      <tr>{section.table.head.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, i) => <td key={i} data-label={section.table.head[i]}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {section.steps && (
                <ol className="legal-steps">
                  {section.steps.map((item, i) => <li key={i}>{item}</li>)}
                </ol>
              )}
              {section.list && (
                <ul>
                  {section.list.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              )}
              {section.after?.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {section.link && (
                <p><Link className="legal-link" to={section.link.to}>{section.link.label} →</Link></p>
              )}
            </section>
          ))}

          <section className="legal-section legal-contact">
            <h2>{helpHeading}</h2>
            <p>{POLICY_CONTACT.hours}</p>
            <ul>
              <li>Phone / WhatsApp: <a href={POLICY_CONTACT.phoneHref}>{POLICY_CONTACT.phone}</a> (<a href={POLICY_CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>)</li>
              <li>Email: <a href={`mailto:${POLICY_CONTACT.email}`}>{POLICY_CONTACT.email}</a></li>
            </ul>
            {policy.closing.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </section>

          <p className="legal-copyright">© Chennai Rice Industries India Private Limited. All Rights Reserved.</p>
        </article>
      </div>
    </main>
  )
}
