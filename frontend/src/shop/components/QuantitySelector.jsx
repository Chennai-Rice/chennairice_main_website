import React from "react";

// min: the lowest it goes (1 before adding; 0 when it is the cart's own quantity, which removes the pack).
export default function QuantitySelector({ qty, onChange, min = 1 }) {
  return (
    <div className="pdp-qty" role="group" aria-label="Quantity">
      <button
        type="button"
        className="pdp-qty-btn"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, qty - 1))}
      >
        &minus;
      </button>
      <span className="pdp-qty-value">{qty}</span>
      <button
        type="button"
        className="pdp-qty-btn"
        aria-label="Increase quantity"
        onClick={() => onChange(qty + 1)}
      >
        +
      </button>
    </div>
  );
}
