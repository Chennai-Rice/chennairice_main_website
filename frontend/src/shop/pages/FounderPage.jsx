import React, { useState } from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import { FOUNDER } from "../data/founder.js";
import { useCountUp } from "../hooks/useCountUp.js";
import { useRevealGroup } from "../hooks/useScrollFx.js";
import usePageMeta from "../hooks/usePageMeta.js";

const GLANCE_ICONS = {
  "From Our Mill": <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
  "Hands-Free Processing": (
    <>
      <path d="M8 21v-6.5a3.5 3.5 0 0 1 7 0V21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 11V4M8.5 6.5 11.5 4l3 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "Pure by Choice": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </>
  ),
  "Quality You Can Trust": (
    <>
      <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
};

function HeroStatFigure({ figure }) {
  const { ref, value } = useCountUp(figure.to);
  return (
    <div className="fp-stat" ref={ref}>
      <p className="fp-stat-value">
        {value.toLocaleString("en-IN")}
        <span>{figure.suffix}</span>
      </p>
      <p className="fp-stat-unit">{figure.text}</p>
    </div>
  );
}

/**
 * A dedicated page for the founder, linked from the About page's founder
 * card. Every figure and fact here is pulled from FOUNDER (src/data/founder.js)
 * and SCALE (already used on the About page), so nothing on this page can
 * drift out of sync with what the rest of the site says.
 */
export default function FounderPage() {
  const pageRef = useRevealGroup();
  const [photoMissing, setPhotoMissing] = useState(false);

  usePageMeta(
    "Meet Our Founder — Chennai Rice",
    `${FOUNDER.name}, ${FOUNDER.title} of Chennai Rice Industries.`
  );

  // same words as FOUNDER.heading, just split so the last word can carry
  // its own weight — the wording itself never changes
  const titleWords = FOUNDER.heading.trim().split(" ");
  const titleLast = titleWords.pop();
  const titleLead = titleWords.join(" ");

  return (
    <SiteLayout skipTo="founder-heading" skipLabel="Skip to content">
      <div className="founder-page" ref={pageRef}>
        <nav className="fp-crumb fp-shell" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Meet Our Founder</span>
        </nav>

        <section className="fp-hero fp-shell">
          <div className="fp-hero-grid">
            {/* sits top-right above the portrait on desktop; falls back to
                the top of the stack on narrow screens */}
            <div className="fp-hero-vision reveal reveal--right">
              <p className="fp-vision-eyebrow">{FOUNDER.eyebrow}</p>
              <span className="fp-hero-rule" aria-hidden="true" />
            </div>

            <div className="fp-hero-copy reveal reveal--left">
              <h1 id="founder-heading" className="fp-hero-title">
                <span className="fp-hero-title-lead">{titleLead}</span>
                <span className="fp-hero-title-strong">{titleLast}</span>
              </h1>

              <blockquote className="fp-intro-block">
                <span className="fp-intro-mark" aria-hidden="true">&ldquo;</span>
                <p className="fp-intro">{FOUNDER.intro}</p>
              </blockquote>

              <div className="fp-hero-sign">
                {/* the script is a flourish; the printed name carries it for
                    anyone the script doesn't render legibly */}
                <p className="fp-signature" aria-hidden="true">
                  {FOUNDER.name}
                </p>
                <p className="fp-name">{FOUNDER.name}</p>
                <p className="fp-title">{FOUNDER.title}</p>
              </div>
              <span className="fp-hero-rule" aria-hidden="true" />
            </div>

            <div className="fp-hero-stage">
              <div className={`fp-hero-photo${photoMissing ? " fp-hero-photo--empty" : ""}`}>
                {photoMissing ? (
                  <span className="fp-hero-initial" aria-hidden="true">
                    {FOUNDER.name.charAt(0)}
                  </span>
                ) : (
                  <img src={FOUNDER.photo} alt={FOUNDER.photoAlt} onError={() => setPhotoMissing(true)} />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="fp-stats-strip reveal" aria-label="The scale of his vision">
          <div className="fp-stats-strip-inner fp-shell">
            {FOUNDER.heroStats.map((figure) => (
              <HeroStatFigure key={figure.text} figure={figure} />
            ))}
          </div>
        </section>

        <section className="fp-vision fp-shell">
          <div className="fp-vision-grid">
            <div className="fp-bio reveal">
              <p className="eyebrow">{FOUNDER.visionEyebrow}</p>
              <h2>{FOUNDER.visionHeading}</h2>
              {FOUNDER.bioLead.map((line) => (
                <p className="fp-bio-lead" key={line}>{line}</p>
              ))}
              {FOUNDER.bio.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
              <p className="fp-bio-closing">{FOUNDER.bioClosing}</p>
            </div>

            <aside className="fp-glance reveal reveal--right" aria-label="What every pack carries">
              <dl>
                {FOUNDER.glance.map((row) => (
                  <div className="fp-glance-row" key={row.label}>
                    <dt>
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                        {GLANCE_ICONS[row.label]}
                      </svg>
                      {row.label}
                    </dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </section>

        <section className="fp-quote-banner fp-shell reveal">
          <img
            className="fp-quote-banner-media"
            src="/assets/about/3dhand.png"
            alt=""
            aria-hidden="true"
          />
          <div className="fp-quote-banner-overlay" aria-hidden="true" />
          <div className="fp-quote-banner-content">
            <span className="fp-quote-mark" aria-hidden="true">
              &ldquo;
            </span>
            <p className="fp-quote-text">{FOUNDER.quote}</p>
            <p className="fp-quote-attr">&mdash; {FOUNDER.quoteAttribution}</p>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
