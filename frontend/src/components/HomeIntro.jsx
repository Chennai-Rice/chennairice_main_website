import { Link } from 'react-router-dom'
import { HOME_BULK } from '../data/content.js'
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
