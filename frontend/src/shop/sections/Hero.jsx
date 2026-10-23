import React from "react";
import { PAGE_META } from "../../seo.js";

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
      <h1 id="hero-heading">{PAGE_META.products.h1}</h1>
      <p className="hero-sub">
        Discover rice varieties from Chennai Rice Industries for everyday cooking and traditional South Indian
        meals. Whether you are looking for Ponni rice for daily dining or aged rice for firm, separate grains,
        explore our product range and compare the available options.
      </p>
    </section>
  );
}
