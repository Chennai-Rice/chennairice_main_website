import React from "react";

/**
 * "Customer reviews" on a product page: the genuine published reviews of this product (GET /api/reviews,
 * orders of this product alone), the same ones its search-result stars come from (productSchema.js).
 * Nothing is shown when the product has no published reviews yet.
 */
export default function ProductReviews({ reviews, average, riceName }) {
  if (!reviews?.length) return null;
  const written = reviews.filter((r) => String(r.text || "").trim());
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  return (
    <div className="pdp-reviews">
      <p className="pdp-reviews-summary">
        <span className="pdp-reviews-stars" aria-hidden="true">{stars(Math.round(average))}</span>
        <strong>{average.toFixed(1)}</strong> out of 5 · rated by {reviews.length} verified customer{reviews.length === 1 ? "" : "s"} of {riceName}
      </p>
      {written.length > 0 && (
        <ul className="pdp-reviews-list">
          {written.slice(0, 10).map((r, i) => (
            <li key={i} className="pdp-review">
              <span className="pdp-reviews-stars" aria-label={`${r.rating} out of 5 stars`}>{stars(r.rating)}</span>
              <p>{r.text}</p>
              <p className="pdp-review-by">— {r.name || "Customer"}{r.city ? `, ${r.city}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
