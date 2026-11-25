import { Link } from 'react-router-dom'
import usePageMeta from '../shop/hooks/usePageMeta.js'

/**
 * Any address the site does not have. Hosting answers these with HTTP 404 (dist/404.html, firebase.json), so
 * search engines drop them; visitors get this page with a way back instead of being sent to the home page
 * without explanation (audit, 25 Nov 2026).
 */
export default function NotFoundPage() {
  usePageMeta('Page not found | Chennai Rice', 'This page does not exist. Shop Ponni and idli rice or go back to the Chennai Rice home page.', { noindex: true })
  return (
    <main className="page page-center">
      <div className="container page-inner">
        <h1 className="page-title">Page not found</h1>
        <p className="page-text">This page does not exist or has moved. Our rice is just a click away.</p>
        <p className="page-text" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link className="btn-maroon" to="/rice-products">Shop rice</Link>
          <Link className="btn-outline" to="/">Home page</Link>
          <Link className="btn-outline" to="/contact-us">Contact us</Link>
        </p>
      </div>
    </main>
  )
}
