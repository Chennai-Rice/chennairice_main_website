import { Link } from 'react-router-dom'
import { HOME_BULK, VARIETIES } from '../data/content.js'
import { productPath } from '../seo.js'
import './homeintro.css'

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

/** "Chennai Rice Varieties": the range by kind of cooking — each card shows its bags, each product linked. */
export function HomeVarieties() {
  return (
    <section className="home-var" aria-labelledby="home-var-title">
      <div className="container home-var-inner">
        <p className="home-var-eyebrow">Our range</p>
        <h2 id="home-var-title" className="home-var-title">{VARIETIES.title}</h2>
        <p className="home-var-intro">{VARIETIES.intro}</p>
        <div className="home-var-grid">
          {VARIETIES.groups.map((g, i) => (
            <article key={g.name} className="home-var-card">
              <div className={`home-var-stage n${Math.min(g.products.length, 3)}`} aria-hidden="true">
                {g.products.slice(0, 3).map(([id]) => (
                  <img key={id} src={`/assets/shop/thumbs/${id}.webp`} alt="" loading="lazy" width="200" height="300" />
                ))}
                <span className="home-var-num">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="home-var-body">
                <h3>{g.name}</h3>
                <p>{g.text}</p>
                <ul className="home-var-chips">
                  {g.products.map(([id, label]) => (
                    <li key={id}><Link to={productPath(id)}>{label} <span aria-hidden="true">→</span></Link></li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
        <Link className="home-var-all" to={VARIETIES.all.to}>{VARIETIES.all.label} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  )
}
