import React, { useState } from "react";

/**
 * Only real photos are ever shown — the thumbnail row simply doesn't render
 * when a product has nothing to switch between. Images flagged `scene` are
 * full-bleed photographs rather than pack cutouts, so they crop to fill the
 * frame instead of floating inside it.
 */
export default function ProductGallery({ images, alt }) {
  const [active, setActive] = useState(0);
  const hasMultiple = images.length > 1;
  const current = images[active] || images[0];

  return (
    <div className="pdp-gallery">
      <figure className="pdp-gallery-main">
        <img
          className={current.scene ? "is-scene" : undefined}
          src={current.src}
          alt={current.alt || alt}
          loading="eager"
        />
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
