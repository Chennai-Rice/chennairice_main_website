import React from "react";
import { SCALE } from "../../data/about.jsx";
import { useParallax } from "../../hooks/useScrollFx.js";
import { useCountUp } from "../../hooks/useCountUp.js";
import ScrollReveal from "../../components/ScrollReveal.jsx";

function Figure({ figure }) {
  const { ref, value } = useCountUp(figure.to);
  return (
    <div className="ab-fig" ref={ref}>
      <p className="ab-fig-value">
        {value.toLocaleString("en-IN")}
        <span className="ab-fig-suffix">{figure.suffix}</span>
      </p>
      <p className="ab-fig-unit">{figure.unit}</p>
      <p className="ab-fig-label">{figure.label}</p>
    </div>
  );
}

export default function Scale() {
  const mediaRef = useParallax(0.1);

  return (
    <section className="ab-scale" aria-labelledby="scale-heading">
      {/* the real plant, full-bleed behind the numbers */}
      <div className="ab-scale-media" ref={mediaRef}>
        <img src="/assets/about/plant.png" alt="Aerial view of the Chennai Rice processing plant and silo farm" />
      </div>

      <div className="about-shell">
        {/* Word-by-word scroll reveal — the first block of text you scroll to.
            It needs scroll distance to scrub against, which is why it lives
            here rather than in the hero (nothing scrolls above the hero). */}
        <ScrollReveal
          containerClassName="ab-scroll-reveal"
          textClassName="ab-scroll-reveal-text"
          baseOpacity={0.12}
          baseRotation={2.5}
          blurStrength={5}
        >
          {SCALE.statement}
        </ScrollReveal>

        <div className="ab-figs reveal d2">
          {SCALE.figures.map((f) => (
            <Figure key={f.label} figure={f} />
          ))}
        </div>

        {/* the value chain, scrolling continuously */}
        <div className="ab-marquee reveal d3" aria-label={SCALE.chain.join(" to ")}>
          <div className="ab-marquee-track">
            {[0, 1].map((copy) => (
              <span className="ab-marquee-run" key={copy} aria-hidden={copy === 1}>
                {SCALE.chain.map((step) => (
                  <span className="ab-marquee-item" key={step}>
                    {step}
                    <i aria-hidden="true">◆</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
