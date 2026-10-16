import React, { useEffect, useState } from "react";

/**
 * Only real photos are ever shown — the thumbnail row simply doesn't render
 * when a product has nothing to switch between. Images flagged `scene` are
 * full-bleed photographs rather than pack cutouts, so they crop to fill the
 * frame instead of floating inside it.
 *
 * `peek` (used on the Kitchidi Ponni pack, which carries the contest coupon):
 * hovering the pack brings the mascot out from behind its left side, leaning
 * and waving, with a "Coupon code inside!" bubble by his head. Touch screens
 * have no hover, so a tap does the same; the tap version folds away again
 * after a few seconds, or on the next tap. On phones and tablets he also pops
 * out and back by himself every 2 seconds, so the coupon is noticed without a
 * tap (not when the visitor has asked for reduced motion).
 */
const PEEK_MS = 6000;
const AUTO_PEEK_MS = 2000;
const AUTO_PEEK_MEDIA = "(hover: none), (max-width: 900px)";

export default function ProductGallery({ images, alt, peek = false }) {
  const [active, setActive] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const hasMultiple = images.length > 1;
  const current = images[active] || images[0];
  const canPeek = peek && !current.scene;

  const [auto, setAuto] = useState(false);

  // Phones and tablets: out for 2 seconds, back for 2 seconds, on repeat.
  useEffect(() => {
    if (!canPeek || typeof window === "undefined" || !window.matchMedia) return undefined;
    const touch = window.matchMedia(AUTO_PEEK_MEDIA);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAuto(touch.matches && !calm.matches);
    update();
    touch.addEventListener?.("change", update);
    calm.addEventListener?.("change", update);
    return () => {
      touch.removeEventListener?.("change", update);
      calm.removeEventListener?.("change", update);
    };
  }, [canPeek]);

  useEffect(() => {
    if (!auto) return undefined;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setPeeking((p) => !p);
    }, AUTO_PEEK_MS);
    return () => window.clearInterval(t);
  }, [auto]);

  useEffect(() => {
    if (!peeking || auto) return undefined;
    const t = window.setTimeout(() => setPeeking(false), PEEK_MS);
    return () => window.clearTimeout(t);
  }, [peeking, auto]);

  return (
    <div className="pdp-gallery">
      <figure className={`pdp-gallery-main${canPeek ? " is-peekable" : ""}${canPeek && peeking ? " is-peeking" : ""}`}>
        {canPeek && (
          // The mascot sits behind the pack; the bubble is its own layer in
          // front of it, placed by his head, so the pack never covers it.
          <>
            <span className="pdp-peek" aria-hidden="true">
              <img className="pdp-peek-mascot" src="/assets/mascot-peek.webp" width="560" height="650" alt="" />
            </span>
            <span className="pdp-peek-bubble" aria-hidden="true">Coupon code inside!</span>
          </>
        )}
        {canPeek ? (
          <button
            type="button"
            className="pdp-bag-btn"
            aria-pressed={peeking}
            aria-label="Kitchidi Ponni pack: coupon code inside"
            onClick={() => setPeeking((p) => !p)}
          >
            <img src={current.src} alt={current.alt || alt} loading="eager" />
          </button>
        ) : (
          <img
            className={current.scene ? "is-scene" : undefined}
            src={current.src}
            alt={current.alt || alt}
            loading="eager"
          />
        )}
      </figure>

      {hasMultiple && (
        <div className="pdp-gallery-thumbs" role="tablist" aria-label="Product images">
          <div className="pdp-gallery-thumb-track">
            {images.map((img, i) => (
              <button
                key={img.src}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`pdp-gallery-thumb${i === active ? " is-active" : ""}`}
                onClick={() => setActive(i)}
              >
                <img
                  className={img.scene ? "is-scene" : undefined}
                  src={img.src}
                  alt={img.alt || ""}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
