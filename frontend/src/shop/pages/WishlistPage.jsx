import React from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import { useProducts } from "../data/products.js";
import { useWishlist } from "../hooks/useWishlist.jsx";
import { useCart } from "../hooks/useCart.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import "../styles/wishlist.css";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

/**
 * Saved items. The store keeps ids only, so every row is resolved against the
 * live catalogue here — a saved pack can never show stale copy or pricing, and
 * an id whose product has since been removed simply drops out of the list.
 */
export default function WishlistPage() {
  const { ids, remove, clear } = useWishlist();
  const { add } = useCart();
  const { products, loading } = useProducts();

  usePageMeta("Saved Items — Chennai Rice Industries", "The packs you have saved for later.");

  const saved = loading ? [] : ids.map((id) => products.find((p) => p.id === id)).filter(Boolean);

  return (
    <SiteLayout skipTo="wishlist-main" skipLabel="Skip to content">
      <main id="wishlist-main" className="wl">
        <div className="wl-shell">
          <header className="wl-head">
            <span className="wl-kicker">Saved Items</span>
            <h1 className="wl-title">Your saved packs</h1>
            {saved.length > 0 && (
              <p className="wl-count">
                {saved.length} {saved.length === 1 ? "pack" : "packs"} saved
              </p>
            )}
          </header>

          {loading ? null : saved.length === 0 ? (
            <div className="wl-empty">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 20s-7-4.35-9.5-8.5C1 8 2.5 4.5 6 4c2-.3 3.8.8 6 3 2.2-2.2 4-3.3 6-3 3.5.5 5 4 3.5 7.5C19 15.65 12 20 12 20z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="wl-empty-text">
                Nothing saved yet. Tap the heart on any pack to keep it here for later.
              </p>
              <Link className="btn-maroon" to="/products">
                Browse our rice
              </Link>
            </div>
          ) : (
            <>
              <ul className="wl-grid">
                {saved.map((product) => (
                  <li className="wl-card" key={product.id}>
                    <Link className="wl-card-media" to={`/products/${product.id}`}>
                      <img
                        src={product.image}
                        alt={product.alt || product.name}
                        width={product.width}
                        height={product.height}
                        loading="lazy"
                      />
                    </Link>

                    <div className="wl-card-body">
                      <span className="wl-card-tag">{product.tag}</span>
                      <Link className="wl-card-name" to={`/products/${product.id}`}>
                        {product.name}
                      </Link>
                      <p className="wl-card-desc">{product.description}</p>
                      <div className="wl-card-price">{inr.format(product.price)}</div>

                      <div className="wl-card-actions">
                        <button type="button" className="btn-maroon wl-add" onClick={() => add(product)}>
                          Add to Cart
                        </button>
                        <button
                          type="button"
                          className="wl-remove"
                          onClick={() => remove(product.id)}
                          aria-label={`Remove ${product.name} from saved items`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="wl-foot">
                <Link className="wl-continue" to="/products">
                  &larr; Continue shopping
                </Link>
                <button type="button" className="wl-clear" onClick={clear}>
                  Clear all saved
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </SiteLayout>
  );
}
