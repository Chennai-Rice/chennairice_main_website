import React from "react";
import { Link } from "react-router-dom";
import StatementCard from "../../components/StatementCard.jsx";
import { LEGACY } from "../../data/legacy.js";

/**
 * The family story, chapter by chapter. Each chapter hangs off a rail: the era
 * sits on the left (sticky on wide screens, so it stays beside a long chapter)
 * and the words on the right.
 */
export function LegacyStory() {
  return (
    <section className="about-shell lg-story" aria-labelledby="lg-story-heading">
      <header className="lg-head reveal">
        <p className="eyebrow">Our Story</p>
        <h2 id="lg-story-heading">Five generations, one grain at a time.</h2>
      </header>

      <ol className="lg-chapters">
        {LEGACY.chapters.map((c, i) => (
          <li className="lg-chapter" key={c.era}>
            <div className="lg-era reveal reveal--left">
              <span className="lg-era-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              {/* years in the big numerals; word eras ("2nd Generation") a step smaller */}
              <span className={`lg-era-year${/^\d+$/.test(c.era) ? "" : " lg-era-year--word"}`}>{c.era}</span>
              <span className="lg-era-label">{c.label}</span>
              {c.portrait && (
                <figure className="lg-portrait">
                  <img src={c.portrait.src} alt={`Portrait of ${c.portrait.name}`} loading="lazy" />
                  <figcaption>
                    <strong>{c.portrait.name}</strong>
                    <span>{c.portrait.role}</span>
                  </figcaption>
                </figure>
              )}
            </div>
            <span className="lg-rail-dot" aria-hidden="true" />
            <div className="lg-copy reveal d1">
              <h3 className="lg-title">{c.title}</h3>
              {c.photo && (
                <figure className="lg-photo">
                  <img src={c.photo.src} alt={c.photo.caption} loading="lazy" />
                  <figcaption>{c.photo.caption}</figcaption>
                </figure>
              )}
              {c.body.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
              {c.quote && <p className="lg-quote">{c.quote}</p>}
              {c.founderLink && (
                <div className="lg-founder">
                  <Link className="ab-founder-link" to="/founder">
                    Meet the founder
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LegacyVision() {
  return (
    <div className="about-shell lg-vision">
      <StatementCard tone="gold" align="left" kicker="Our Vision" bare>
        {LEGACY.vision}
      </StatementCard>
    </div>
  );
}

/** The whole journey at a glance, top to bottom, as the family laid it out. */
export function LegacyEvolution() {
  return (
    <section className="about-shell lg-evo" aria-labelledby="lg-evo-heading">
      <header className="lg-head lg-head--center reveal">
        <p className="eyebrow">At a glance</p>
        <h2 id="lg-evo-heading">Our Evolution Through Generations</h2>
      </header>
      <ol className="lg-evo-list">
        {LEGACY.evolution.map((s, i) => (
          <li className={`lg-evo-step reveal d${Math.min(i % 3, 2)}`} key={s.era + s.title}>
            <span className="lg-evo-era">{s.era}</span>
            <span className="lg-evo-title">{s.title}</span>
            <span className="lg-evo-note">{s.note}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LegacyClosing() {
  const { title, body, signoff } = LEGACY.closing;
  return (
    <section className="lg-close" aria-labelledby="lg-close-heading">
      <div className="about-shell lg-close-inner reveal">
        <h2 id="lg-close-heading">{title}</h2>
        {body.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
        <div className="lg-signoff">
          {signoff.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
