import { FEATURES, FEATURES_TITLE, PRODUCTS } from '../data/content.js'
import SectionHead from './SectionHead.jsx'
import './featurestrip.css'

/* "Why Tamil Homes Trust Chennai Rice?" (Nov 2026): moved up to sit between the hero and Our
   Bestsellers, and made light to suit that place: after the dark film a second dark band felt
   heavy. Its ground is the first pack's tint, the colour the hero's wave is filled with and the
   showcase opens on, so the three read as one surface. Six cards, one per reason. */
const GROUND = PRODUCTS[0]?.tint || '#f8f3e9'

/* Thin-line gold icons traced to match the reference strip. */
const ICONS = {
  sourced: (
    <>
      <path d="M8 26c0 6 4.5 10 10 10h8c5.5 0 10-4 10-10" />
      <path d="M22 24c0-5 2-9 6-12" />
      <path d="M22 24c-1-4-3.5-6.5-7-8" />
      <path d="M22 24c1.5-3.5 4-5.5 7.5-6.5" />
      <path d="M22 24v6" />
    </>
  ),
  processed: (
    <>
      <path d="M22 8c4 6 7 10 7 14a7 7 0 1 1-14 0c0-4 3-8 7-14z" />
      <path d="M32 12l1.5 3.5L37 17l-3.5 1.5L32 22l-1.5-3.5L27 17l3.5-1.5z" />
      <path d="M13 30c-1.5 2-3.5 3-6 3" />
    </>
  ),
  quality: (
    <>
      <path d="M22 7l13 5v10c0 8-5.5 13.5-13 16-7.5-2.5-13-8-13-16V12z" />
      <ellipse cx="22" cy="21" rx="4" ry="7" transform="rotate(28 22 21)" />
    </>
  ),
  grains: (
    <>
      <circle cx="22" cy="22" r="15" />
      <ellipse cx="16" cy="17" rx="2" ry="4" transform="rotate(30 16 17)" />
      <ellipse cx="22" cy="15" rx="2" ry="4" transform="rotate(30 22 15)" />
      <ellipse cx="28" cy="18" rx="2" ry="4" transform="rotate(30 28 18)" />
      <ellipse cx="16" cy="26" rx="2" ry="4" transform="rotate(30 16 26)" />
      <ellipse cx="22" cy="24" rx="2" ry="4" transform="rotate(30 22 24)" />
      <ellipse cx="28" cy="27" rx="2" ry="4" transform="rotate(30 28 27)" />
    </>
  ),
  polish: (
    <>
      <ellipse cx="20" cy="24" rx="6" ry="10" transform="rotate(35 20 24)" />
      <path d="M31 9l1.5 4L36 14.5 32.5 16 31 20l-1.5-4L26 14.5 29.5 13z" />
      <path d="M9 35L35 9" />
    </>
  ),
  aroma: (
    <>
      <path d="M8 24h28c0 7-6 12-14 12S8 31 8 24z" />
      <path d="M6 24h32" />
      <path d="M17 17c2-2 0-4 0-6" />
      <path d="M22 16c2-2.5 0-4.5 0-7" />
      <path d="M27 17c2-2 0-4 0-6" />
    </>
  ),
}

export default function FeatureStrip() {
  return (
    <section className="feat" style={{ backgroundColor: GROUND }} aria-labelledby="feat-title">
      <div className="container">
        <div className="feat-head" id="feat-title">
          <SectionHead label="Why Chennai Rice" title={FEATURES_TITLE} />
        </div>
        <ul className="feat-grid">
          {FEATURES.map((f) => (
            <li className="feat-card" key={f.icon}>
              <span className="feat-badge" aria-hidden="true">
                <svg
                  className="feat-icon"
                  width="30"
                  height="30"
                  viewBox="0 0 44 44"
                  fill="none"
                  stroke="#e6c67c"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {ICONS[f.icon]}
                </svg>
              </span>
              <h3 className="feat-label">{f.label.join(' ')}</h3>
              <p className="feat-text">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
