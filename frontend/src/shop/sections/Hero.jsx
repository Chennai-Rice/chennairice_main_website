import React from "react";

// Product-page hero: the gold "Premium Collection" pill with its five
// twinkling glints, plus the heading and subline.
export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <p className="premium-mark">
        <span className="pp-pill">
          <span aria-hidden="true">&#10022;</span>
          Premium Collection
          <span aria-hidden="true">&#10022;</span>
        </span>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`glint g${n}`} aria-hidden="true" />
        ))}
      </p>
      <h1 id="hero-heading">Kitchidi Ponni Rice</h1>
      <p className="hero-sub">
        Ponni and Kolam varieties, milled and sealed at our own Erode facility and packed in 10&nbsp;kg family bags.
      </p>
    </section>
  );
}
