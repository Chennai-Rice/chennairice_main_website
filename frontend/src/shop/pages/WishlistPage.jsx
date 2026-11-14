import React, { useState } from "react";
import { Link } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import { useProducts } from "../data/products.js";
import { useWishlist } from "../hooks/useWishlist.jsx";
import { useCart } from "../hooks/useCart.jsx";
import usePageMeta from "../hooks/usePageMeta.js";
import "../styles/wishlist.css";
import { productPath } from "../../seo.js";

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

  usePageMeta("Saved Items — Chennai Rice Industries", "The packs you have saved for later.", { noindex: true });

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
              <Link className="btn-maroon" to="/rice-products">
                Browse our rice
              </Link>
            </div>
          ) : (
            <>
              <ul className="wl-grid">
                {saved.map((product) => (
                  <WishlistCard key={product.id} product={product} onAdd={add} onRemove={remove} />
                ))}
              </ul>

              <div className="wl-foot">
                <Link className="wl-continue" to="/rice-products">
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

/**
 * One saved product. The cart needs a pack size (the server prices "slug-5kg", not the bare product), so
 * the card offers the packs that can be bought now: the 10 kg pack first if it can, else the smallest.
 * A product with no pack in stock (or no price) cannot be added.
 */
function WishlistCard({ product, onAdd, onRemove }) {
  const buyable = (product.packSizes || []).filter((s) => s.inStock && s.price != null && s.price > 0);
  const [kg, setKg] = useState(() => (buyable.find((s) => s.kg === 10) || buyable[0])?.kg ?? null);
  const [added, setAdded] = useState(false);
  const pack = buyable.find((s) => s.kg === kg) || buyable[0] || null;

  const addPack = () => {
    if (!pack) return;
    onAdd({
      ...product,
      id: `${product.id}-${pack.kg}kg`,
      name: `${product.name} (${pack.kg} kg)`,
      price: pack.price,
      packKg: pack.kg,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <li className="wl-card">
      <Link className="wl-card-media" to={productPath(product.id)}>
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
        <Link className="wl-card-name" to={productPath(product.id)}>
          {product.name}
        </Link>
        <p className="wl-card-desc">{product.description}</p>
        <div className="wl-card-price">
          {pack ? <>{inr.format(pack.price)} <small>/ {pack.kg} kg</small></> : "Out of stock"}
        </div>

        {buyable.length > 1 && (
          <div className="wl-packs" role="group" aria-label={`Pack size for ${product.name}`}>
            {buyable.map((s) => (
              <button
                key={s.kg}
                type="button"
                className={`wl-pack${s.kg === pack?.kg ? " is-active" : ""}`}
                aria-pressed={s.kg === pack?.kg}
                onClick={() => setKg(s.kg)}
              >
                {s.kg} kg
              </button>
            ))}
          </div>
        )}

        <div className="wl-card-actions">
          <button type="button" className="btn-maroon wl-add" onClick={addPack} disabled={!pack}>
            {!pack ? "Out of stock" : added ? "Added ✓" : "Add to Cart"}
          </button>
          <button
            type="button"
            className="wl-remove"
            onClick={() => onRemove(product.id)}
            aria-label={`Remove ${product.name} from saved items`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
