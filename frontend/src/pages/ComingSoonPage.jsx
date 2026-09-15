import { Link } from 'react-router-dom'
import Ornament from '../components/Ornament.jsx'
import './page.css'

export default function ComingSoonPage({ title, blurb }) {
  return (
    <main className="page page-center">
      <div className="container page-inner">
        <div className="section-label">
          <Ornament />
          <span>Coming Soon</span>
          <Ornament flip />
        </div>
        <h1 className="page-title">{title}</h1>
        <p className="page-text">{blurb}</p>
        <Link className="btn-maroon" to="/">
          Back to Home
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12h15m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </main>
  )
}
