import React from "react";
import { CTA } from "../../data/about.jsx";

/**
 * Layout 4: the close — the claim and the copy in one column, the whole
 * workforce photographed together in the next. The picture sits beside the
 * words rather than behind them, so nothing is read through a silhouette.
 */
export default function PromiseCta() {
  return (
    <section className="ab-cta" aria-labelledby="cta-heading">
      <div className="ab-cta-grid about-shell">
        <div className="ab-cta-inner">
          <h2 id="cta-heading" className="ab-display ab-cta-title reveal">
            {CTA.heading.map((line) => (
              <span className="ab-line" key={line}>
                {line}
              </span>
            ))}
          </h2>

          <div className="ab-people-copy">
            {CTA.paragraphs.map((paragraph, index) => (
              <p key={paragraph.slice(0, 24)} className={`reveal d${Math.min(index + 1, 3)}`}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <figure className="ab-cta-media reveal reveal--right d1">
          <img
            src="/assets/about/team-silhouette.png"
            alt="Chennai Rice Industries' workforce standing together in a paddy field, with the city skyline behind them"
            loading="lazy"
          />
        </figure>
      </div>
    </section>
  );
}
