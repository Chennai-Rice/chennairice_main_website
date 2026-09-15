import React from "react";

export default function QuantitySelector({ qty, onChange }) {
  return (
    <div className="pdp-qty" role="group" aria-label="Quantity">
      <button
        type="button"
        className="pdp-qty-btn"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, qty - 1))}
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
