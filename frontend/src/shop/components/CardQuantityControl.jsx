import React, { useEffect, useRef } from "react";
import { useCart } from "../hooks/useCart.jsx";
import { useRipple } from "../hooks/useRipple.js";

/**
 * Sits where "Add to cart" is until the item is actually in the cart, then
 * swaps in place for a qty stepper (+/-) — the same "View more" button next
 * to it never moves, so clicking + repeatedly doesn't shift the layout.
 */
export default function CardQuantityControl({ product }) {
  const spawnRipple = useRipple();
  const { items, add, setQty } = useCart();
  const line = items.find((item) => item.id === product.id);
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!line) {
    return (
      <button
        className="add-btn"
        type="button"
        onClick={(event) => {
          spawnRipple(event);
          add(product);
        }}
      >
        <span className="add-label">Add to cart</span>
      </button>
    );
  }

  return (
    <div className="qty qty--card" role="group" aria-label={`Quantity for ${product.name}`}>
      <button
        className="qty-btn"
        type="button"
        aria-label="Decrease quantity"
        onClick={() => setQty(line.id, line.qty - 1)}
      >
        &minus;
      </button>
      <span className="qty-value">{line.qty}</span>
      <button
        className="qty-btn"
        type="button"
        aria-label="Increase quantity"
        onClick={() => setQty(line.id, line.qty + 1)}
      >
        +
      </button>
    </div>
  );
}
