import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart.jsx";
import { useReducedMotion } from "../hooks/useReducedMotion.js";

const CartGlyph = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <path
      d="M3 4 h2.5 l2.2 11 h10.5 l2-7.5 H7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="9.5" cy="19.5" r="1.6" fill="currentColor" />
    <circle cx="16.5" cy="19.5" r="1.6" fill="currentColor" />
  </svg>
);

/**
 * On the cart page itself the original rendered a <span> with aria-current
 * rather than a link; `current` reproduces that.
 */
export default function CartButton({ current = false }) {
  const { count } = useCart();
  const reducedMotion = useReducedMotion();
  const badgeRef = useRef(null);
  const previous = useRef(count);

  // The "bump" keyframe replayed whenever the count grows.
  useEffect(() => {
    const badge = badgeRef.current;
    const grew = count > previous.current;
    previous.current = count;
    if (!badge || !grew || reducedMotion) return;

    badge.classList.remove("bump");
    void badge.offsetWidth; // force a reflow so the animation restarts
    badge.classList.add("bump");
  }, [count, reducedMotion]);

  const label = current ? "Cart" : `Cart, ${count} ${count === 1 ? "item" : "items"}`;

  const badge = (
    <span className="cart-count" ref={badgeRef} aria-hidden="true">
      {count}
    </span>
  );

  if (current) {
    return (
      <span className="cart-btn cart-btn--current" aria-current="page" aria-label={label}>
        <CartGlyph />
        {badge}
      </span>
    );
  }

  return (
    <Link className="cart-btn" to="/cart" aria-label={label}>
      <CartGlyph />
      {badge}
    </Link>
  );
}
