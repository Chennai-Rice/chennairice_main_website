import React from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import CartRow from "../components/CartRow.jsx";
import { useCart } from "../hooks/useCart.jsx";
import { formatRupees } from "../utils/format.js";
import usePageMeta from "../hooks/usePageMeta.js";
import { isCheckoutEnabled } from "../../config.js";

// Which note appears under the button depends on whether payments are live —
// promising "you'll pay securely on the next step" while /checkout shows Coming
// Soon would read as a broken site rather than an unfinished one.
const CHECKOUT_NOTE = "Delivery is free. You'll pay securely on the next step.";
const COMING_SOON_NOTE = "Online payment is opening shortly — tap through to see where we are.";

export default function CartPage() {
  const { items, count, subtotal } = useCart();

  usePageMeta("Your Cart — Chennai Rice", "Your cart — Chennai Rice Industries.");

  const isEmpty = items.length === 0;

  return (
    <SiteLayout skipTo="cart-heading" skipLabel="Skip to cart" cartIsCurrent>
      <section className="cart-page">
        <p className="eyebrow">Order review</p>
        <h1 id="cart-heading">Your cart</h1>

        {/* Rendering one branch or the other replaces the original's
            hidden-attribute toggle, so the summary can never appear beside the
            empty-cart message. */}
        {isEmpty ? (
          <div className="cart-empty">
            <p className="cart-empty-title">Your cart is empty</p>
            <p>Pick a 10&nbsp;kg pack from the range and it will show up here.</p>
            <Link className="checkout-btn checkout-btn--link" to="/">
              Browse the packs
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <ul className="cart-items" aria-label="Items in your cart">
              {items.map((item) => (
                <CartRow key={item.id} item={item} />
              ))}
            </ul>

            <aside className="cart-summary" aria-label="Order summary">
              <h2>Order summary</h2>
              <dl className="summary-rows">
                <div className="summary-row">
                  <dt>Subtotal</dt>
                  <dd>{formatRupees(subtotal)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Packs</dt>
                  <dd>{count}</dd>
                </div>
                <div className="summary-row summary-row--muted">
                  <dt>Delivery</dt>
                  <dd>Free</dd>
                </div>
                <div className="summary-row summary-row--total">
                  <dt>Total</dt>
                  <dd>{formatRupees(subtotal)}</dd>
                </div>
              </dl>

              <Link className="checkout-btn checkout-btn--link" to="/checkout">
                Proceed to checkout
              </Link>
              <p className="summary-note" role="status">
                {isCheckoutEnabled ? CHECKOUT_NOTE : COMING_SOON_NOTE}
              </p>
            </aside>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
