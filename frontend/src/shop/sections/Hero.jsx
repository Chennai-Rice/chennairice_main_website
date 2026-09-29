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
      {/* The page lists the whole range, so the heading names the range. It
          used to read "Kitchidi Ponni Rice" — one pack out of thirteen — which
          both misdescribed the page and made it compete with the Kitchidi Ponni
          product page for the same search. */}
      <h1 id="hero-heading">Our Rice Packs</h1>
      <p className="hero-sub">
        Ponni, Sappadu and Rajabhogam varieties, milled and sealed at our own Erode facility and packed from
        5&nbsp;kg to 26&nbsp;kg.
      </p>
    </section>
  );
}
