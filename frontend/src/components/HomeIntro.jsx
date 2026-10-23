import { Link } from 'react-router-dom'
import Ornament from './Ornament.jsx'
import { HOME_INTRO, HOME_BULK } from '../data/content.js'
import './homeintro.css'

/** The home page's opening copy (SEO Optimization Plan, Oct 2026), right under the hero. */
export function HomeIntro() {
  return (
    <section className="home-intro" aria-labelledby="home-intro-title">
      <div className="container home-intro-inner">
        <div className="section-label">
          <Ornament />
          <span>{HOME_INTRO.label}</span>
          <Ornament flip />
        </div>
        <h2 id="home-intro-title" className="home-intro-title">{HOME_INTRO.title}</h2>
        {HOME_INTRO.paragraphs.map((p) => (
          <p key={p} className="home-intro-text">{p}</p>
        ))}
        <div className="home-intro-actions">
          {HOME_INTRO.links.map((l, i) => (
            <Link key={l.to} className={i === 0 ? 'btn-maroon' : 'home-intro-link'} to={l.to}>{l.label}</Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/** "Looking for a Rice Supplier for Your Business?" — the business buyers' route to Bulk Order. */
export function HomeBulk() {
  return (
    <section className="home-bulk" aria-labelledby="home-bulk-title">
      <div className="container home-bulk-inner">
        <div>
          <h2 id="home-bulk-title" className="home-bulk-title">{HOME_BULK.title}</h2>
          <p className="home-bulk-text">{HOME_BULK.text}</p>
        </div>
        <Link className="btn-maroon" to="/bulk-order">{HOME_BULK.button}</Link>
      </div>
    </section>
  )
}
