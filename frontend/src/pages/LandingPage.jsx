import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteLayout from '../shop/layouts/SiteLayout.jsx'
import ProductCard from '../shop/components/ProductCard.jsx'
import { useProducts } from '../shop/data/products.js'
import usePageMeta from '../shop/hooks/usePageMeta.js'
import { PAGE_META } from '../seo.js'
import { LANDING } from '../data/landing.js'
import './landing.css'

const TAMIL_FONT = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&display=swap'

// A rice guide's "Updated" date (GUIDE_META in data/guides.js), e.g. 29 October 2026.
const longDate = (iso) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

const UI = {
  en: { faq: 'Frequently asked questions', more: 'Explore more', loading: 'Loading packs…' },
  ta: { faq: 'அடிக்கடி கேட்கப்படும் கேள்விகள்', more: 'மேலும் பார்க்க', loading: 'அரிசி வகைகள் ஏற்றப்படுகின்றன…' },
}

/**
 * A topic landing page (SEO sheet Phase 2): /ponni-rice, /idli-rice,
 * /rice-distributorship and the Tamil pages. One layout, its words from
 * data/landing.js and its title, description and H1 from seo.js. The FAQ and
 * breadcrumb structured data are in each page's pre-rendered HTML
 * (scripts/prerender-head.mjs).
 */
export default function LandingPage({ id }) {
  const page = LANDING[id]
  const meta = PAGE_META[id]
  const ui = UI[page.lang] || UI.en
  usePageMeta(meta.title, meta.description)

  // Tamil pages: the page language, and a Tamil typeface (the site's fonts
  // have no Tamil letters).
  useEffect(() => {
    if (page.lang !== 'ta') return undefined
    const html = document.documentElement
    const before = html.lang
    html.lang = 'ta'
    if (!document.querySelector(`link[href="${TAMIL_FONT}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = TAMIL_FONT
      document.head.appendChild(link)
    }
    return () => { html.lang = before || 'en' }
  }, [page.lang])

  const { products, loading } = useProducts()
  const packs = (page.productIds || [])
    .map((pid) => products.find((p) => p.id === pid))
    .filter(Boolean)

  return (
    <SiteLayout skipTo="lp-main" skipLabel={page.lang === 'ta' ? 'உள்ளடக்கத்துக்குச் செல்ல' : 'Skip to content'}>
      <div className={`lp lp--${page.key}`} lang={page.lang} id="lp-main">
        <header className="lp-hero">
          <div className="lp-shell">
            <p className="lp-eyebrow">{page.eyebrow}</p>
            <h1 className="lp-title">{meta.h1}</h1>
            {meta.updated && (
              <p className="lp-byline">
                By Chennai Rice Industries, Erode · Updated <time dateTime={meta.updated}>{longDate(meta.updated)}</time>
              </p>
            )}
            {page.intro.map((t) => <p className="lp-intro" key={t}>{t}</p>)}
            <div className="lp-hero-actions">
              {page.cta && <Link className="lp-btn" to={page.cta.to}>{page.cta.label}</Link>}
              {page.alternate && (
                <Link className="lp-lang" to={page.alternate.path} hrefLang={page.alternate.lang} lang={page.alternate.lang}>
                  {page.alternate.label}
                </Link>
              )}
            </div>
          </div>
        </header>

        {page.productIds?.length > 0 && (
          <section className="lp-products" aria-labelledby="lp-products-h">
            <div className="lp-shell lp-shell--wide">
              <h2 id="lp-products-h" className="lp-h2">{page.productsHeading}</h2>
              {loading && !packs.length ? (
                <p className="lp-muted">{ui.loading}</p>
              ) : (
                <ul className="product-grid">
                  {packs.map((p) => (
                    <li key={p.id}><ProductCard product={p} /></li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <div className="lp-body">
          <div className="lp-shell">
            {page.sections.map((s) => (
              <section className="lp-section" key={s.h2}>
                <h2 className="lp-h2">{s.h2}</h2>
                {s.p?.map((t) => <p key={t}>{t}</p>)}
                {s.list && <ul className="lp-list">{s.list.map((t) => <li key={t}>{t}</li>)}</ul>}
                {s.steps && <ol className="lp-steps">{s.steps.map((t) => <li key={t}>{t}</li>)}</ol>}
                {s.table && (
                  <div className="lp-table-wrap" role="region" aria-label={s.h2} tabIndex={0}>
                    <table className="lp-table">
                      <thead><tr>{s.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                      <tbody>
                        {s.table.rows.map((r) => (
                          <tr key={r[0]}>{r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {s.note && <p className="lp-note">{s.note}</p>}
              </section>
            ))}

            {page.cta && (
              <p className="lp-cta-row"><Link className="lp-btn" to={page.cta.to}>{page.cta.label}</Link></p>
            )}

            {page.faqs?.length > 0 && (
              <section className="lp-section lp-faq" aria-labelledby="lp-faq-h">
                <h2 id="lp-faq-h" className="lp-h2">{ui.faq}</h2>
                <div className="lp-faq-list">
                  {page.faqs.map((f, i) => (
                    <details className="lp-faq-item" key={f.q} open={i === 0}>
                      <summary><h3 className="lp-faq-q">{f.q}</h3><span className="lp-faq-icon" aria-hidden="true" /></summary>
                      <p className="lp-faq-a">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {page.links?.length > 0 && (
              <nav className="lp-links" aria-label={ui.more}>
                <h2 className="lp-h2 lp-h2--small">{ui.more}</h2>
                <ul>
                  {page.links.map((l) => (
                    <li key={l.to}><Link to={l.to}>{l.label} <span aria-hidden="true">→</span></Link></li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </div>
      </div>
    </SiteLayout>
  )
}
