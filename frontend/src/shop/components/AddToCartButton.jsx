import React, { useEffect, useRef, useState } from "react";
import { useRipple } from "../hooks/useRipple.js";
import { useCart } from "../hooks/useCart.jsx";

/**
 * Add to cart, with the ripple and the 1.4s "Added ✓" confirmation from the
 * original. The timer is cleared on unmount so a card that gets filtered away
 * mid-confirmation cannot set state after it is gone.
 */
export default function AddToCartButton({ product }) {
  const spawnRipple = useRipple();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = (event) => {
    spawnRipple(event);
    add(product);
    setAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <button
      className={`add-btn${added ? " is-added" : ""}`}
      type="button"
      onClick={handleClick}
      disabled={added}
    >
      <span className="add-label">{added ? "Added ✓" : "Add to cart"}</span>
    </button>
  );
}
