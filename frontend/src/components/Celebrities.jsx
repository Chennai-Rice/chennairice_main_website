import Img from './Img.jsx'
import SectionHead from './SectionHead.jsx'
import { ASSETS, CELEBS, CELEB_HEAD } from '../data/content.js'
import './celebrities.css'

/** The opening quote mark above each testimonial, drawn rather than typed so
 *  it takes the card's accent colour and sits on the baseline we want. */
const QuoteMark = () => (
  <svg className="celeb-mark" viewBox="0 0 40 28" aria-hidden="true">
    <path d="M0 28V15.4C0 6.9 5.2 1.2 14.4 0l1.6 4.5c-4.9 1.2-7.4 4-7.6 8.3H16V28H0zm24 0V15.4C24 6.9 29.2 1.2 38.4 0L40 4.5c-4.9 1.2-7.4 4-7.6 8.3H40V28H24z" />
  </svg>
)

export default function Celebrities() {
  return (
    <section className="celeb">
      <Img className="celeb-decor celeb-decor-left" src={ASSETS.wheatRight} alt="" aria-hidden="true" />
      <Img className="celeb-decor celeb-decor-right" src={ASSETS.wheatRight} alt="" aria-hidden="true" />

      <div className="container celeb-head">
        <SectionHead label={CELEB_HEAD.label} title={CELEB_HEAD.title} />
        <p className="celeb-blurb">{CELEB_HEAD.blurb}</p>
      </div>

      <div className="container celeb-grid">
        {CELEBS.map(c => (
          <figure className={`celeb-card is-${c.tone}`} key={c.name}>
            {/* The name sits inside the tinted panel, above the head — hence
                the stage rather than a plain image wrapper. */}
            <div className="celeb-stage">
              <h3 className="celeb-name">{c.name}</h3>
              <Img
                className="celeb-photo"
                src={c.image}
                alt={c.name}
                loading="lazy"
                style={{ '--figure': `${c.figure}%`, '--drop': `${c.drop}%` }}
              />
            </div>

            <figcaption className="celeb-foot">
              <QuoteMark />
              <span className="celeb-rule" aria-hidden="true" />
              <blockquote className="celeb-quote">{c.quote}</blockquote>
              <span className="celeb-dash" aria-hidden="true" />
              <span className="celeb-role">{c.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
