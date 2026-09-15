import React from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart.jsx";

const BagGlyph = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path
      d="M6 8h12l-1 12H7z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Floating pill, fixed to the bottom of the viewport, that only renders once
 * something is in the cart — a shortcut to /cart from anywhere on the page
 * without scrolling back up to the header's cart icon.
 */
export default function CheckoutBar() {
  const { count } = useCart();

  if (count === 0) return null;

  return (
    <div className="checkout-bar" role="status">
      <Link className="checkout-bar-link" to="/cart">
        <span className="checkout-bar-icon" aria-hidden="true">
          <BagGlyph />
        </span>
        <span className="checkout-bar-text">
          <strong>Proceed to checkout</strong>
          <span className="checkout-bar-count">
            {count} {count === 1 ? "item" : "items"} in cart
          </span>
        </span>
        <span className="checkout-bar-chevron" aria-hidden="true">
          <ChevronRight />
        </span>
      </Link>
    </div>
  );
}
