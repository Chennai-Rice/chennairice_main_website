import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CardQuantityControl from "./CardQuantityControl.jsx";
import { formatRupees } from "../utils/format.js";
import { showCardPrices } from "../../config.js";

// Slow enough to read a row of four before it moves on.
const AUTO_ADVANCE_MS = 5000;

/**
 * "You may also like" — a horizontal rail rather than a grid.
 *
 * Twelve related packs in a wrapping grid pushed the rest of the page a long
 * way down and gave every one of them equal weight. A rail keeps the section a
 * fixed height and lets someone browse sideways.
 *
 * The scrolling itself is native overflow with CSS scroll-snap, so it works
 * with a trackpad, a touch swipe, the arrow keys and a screen reader before any
 * of this JavaScript runs. The buttons are a convenience layered on top: they
 * are hidden when there is nothing to scroll, and each one disables itself at
 * its end of the track.
 */
export default function RelatedProducts({ products }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [paused, setPaused] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // A pixel of tolerance: sub-pixel layout means scrollLeft rarely lands
    // exactly on the maximum, which would leave the button enabled forever.
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    // Card widths are responsive, so the scrollable distance changes with the
    // viewport — not just with the number of products.
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [sync, products]);

  const page = useCallback((direction) => {
    const el = trackRef.current;
    if (!el) return;
    // One rail-width per press. The columns are sized to fit exactly four, so
    // this advances a clean set of four rather than leaving a card half cut.
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  }, []);

  /* Auto-advance, one set of four at a time, looping back to the start when it
     runs out. Paused while the visitor is pointing at, touching or tabbing
     through the rail — advancing the thing someone is reading is worse than
     not advancing at all — and switched off entirely for anyone who has asked
     for reduced motion, and while the tab is in the background. */
  useEffect(() => {
    if (paused) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const id = window.setInterval(() => {
      const el = trackRef.current;
      if (!el || document.hidden) return;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 1) el.scrollTo({ left: 0, behavior: "smooth" });
      else page(1);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(id);
  }, [paused, page, products]);

  if (products.length === 0) return null;

  const scrollable = !(atStart && atEnd);

  return (
    <div
      className="pdp-related-rail"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="pdp-related-track" ref={trackRef} tabIndex={0} aria-label="Related products">
        {products.map((product) => {
          const buyable = product.packSizes.filter((s) => s.inStock !== false);
          const defaultSize =
            buyable.find((s) => s.kg === 10) || buyable[0] ||
            product.packSizes.find((s) => s.kg === 10) || product.packSizes[0];
          const soldOut = defaultSize.inStock === false;
          const cartProduct = {
            ...product,
            id: `${product.id}-${defaultSize.kg}kg`,
            name: `${product.name} (${defaultSize.kg} kg)`,
            price: defaultSize.price,
          };
          return (
            <article className="pdp-related-card" key={product.id}>
              <Link to={`/products/${product.id}`} className="pdp-related-media">
                <img src={product.image} alt={product.alt} loading="lazy" />
              </Link>
              <Link to={`/products/${product.id}`} className="pdp-related-name">
                {product.name}
              </Link>
              <p className="pdp-related-tag">{product.tag}</p>
              {/* Prices are unpublished, so these cards say so and offer a
                  route to sales — exactly as the product grid and the detail
                  page above them do. Without this they printed "₹0". */}
              {showCardPrices && soldOut ? (
                <>
                  <p className="pdp-related-price">
                    {defaultSize.price == null ? "Out of stock" : formatRupees(defaultSize.price)} <span>/ {defaultSize.kg} kg</span>
                  </p>
                  <button className="add-btn add-btn--soldout" type="button" disabled>
                    <span className="add-label">Out of stock</span>
                  </button>
                </>
              ) : showCardPrices ? (
                <>
                  <p className="pdp-related-price">
                    {formatRupees(defaultSize.price)} <span>/ {defaultSize.kg} kg</span>
                  </p>
                  <CardQuantityControl product={cartProduct} />
                </>
              ) : (
                <>
                  <p className="pdp-related-price">
                    Price on request <span>/ {defaultSize.kg} kg</span>
                  </p>
                  <Link className="add-btn contact-sales-btn" to="/contact">
                    Contact sales
                  </Link>
                </>
              )}
            </article>
          );
        })}
      </div>

      {scrollable && (
        <>
          <button
            type="button"
            className="pdp-related-nav pdp-related-nav--prev"
            onClick={() => page(-1)}
            disabled={atStart}
            aria-label="Show previous products"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5L8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="pdp-related-nav pdp-related-nav--next"
            onClick={() => page(1)}
            disabled={atEnd}
            aria-label="Show more products"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
