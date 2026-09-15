import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CardQuantityControl from "./CardQuantityControl.jsx";
import { useRipple } from "../hooks/useRipple.js";
import { useWishlist } from "../hooks/useWishlist.jsx";
import { formatRupees } from "../utils/format.js";

export default function ProductCard({ product }) {
  const spawnRipple = useRipple();
  const wishlist = useWishlist();

  // Keyed on the product, not on the cart line: saving a pack saves the
  // pack, not one particular size of it. That also keeps the card, the
  // product page and the header count showing the same thing.
  const saved = wishlist.has(product.id);

  const sizes = product.packSizes || [{ kg: 10, price: product.price }];
  const defaultSize = sizes.find((s) => s.kg === 10) || sizes[0];
  const [selectedKg, setSelectedKg] = useState(defaultSize.kg);
  const selected = sizes.find((s) => s.kg === selectedKg) || defaultSize;

  // The cart line item needs a unique id per size and the size's own price,
  // so switching pack size never overwrites a different size already in cart.
  const cartProduct = useMemo(
    () => ({
      ...product,
      id: `${product.id}-${selected.kg}kg`,
      name: `${product.name} (${selected.kg} kg)`,
      price: selected.price,
    }),
    [product, selected]
  );

  return (
    <article className={`card card--${product.variant}`}>
      <figure className="card-media">
        {product.flag && <span className="premium-flag">{product.flag}</span>}

        {/* Pinned opposite the premium flag so the two never collide. The
            label carries the product name because a grid of cards would
            otherwise announce several identical "Save to wishlist" buttons. */}
        <button
          type="button"
          className={`card-wishlist${saved ? " is-active" : ""}`}
          aria-pressed={saved}
          aria-label={
            saved
              ? `Remove ${product.name} from saved items`
              : `Save ${product.name} to saved items`
          }
          onClick={() => wishlist.toggle(product.id)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          >
            <path
              d="M12 20s-7-4.35-9.5-8.5C1 8 2.5 4.5 6 4c2-.3 3.8.8 6 3 2.2-2.2 4-3.3 6-3 3.5.5 5 4 3.5 7.5C19 15.65 12 20 12 20z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <img
          src={product.image}
          alt={product.alt}
          width={product.width}
          height={product.height}
          loading="lazy"
        />
      </figure>
      <div className="card-body">
        <p className="card-tag">{product.tag}</p>
        <h3 className="card-title">{product.name}</h3>
        <p className="card-desc">{product.description}</p>

        <div className="pack-size-group" role="group" aria-label={`Pack size for ${product.name}`}>
          {sizes.map((size) => (
            <button
              key={size.kg}
              type="button"
              className={`pack-size-pill${size.kg === selectedKg ? " is-selected" : ""}`}
              aria-pressed={size.kg === selectedKg}
              onClick={() => setSelectedKg(size.kg)}
            >
              {size.kg} kg
            </button>
          ))}
        </div>

        <div className="card-foot">
          <p className="price">
            <span className="price-amount">{formatRupees(selected.price)}</span>{" "}
            <span className="price-unit">/ {selected.kg} kg</span>
          </p>
          <div className="card-actions">
            <Link className="view-btn" to={`/products/${product.id}`} onClick={spawnRipple}>
              View more
            </Link>
            <CardQuantityControl product={cartProduct} />
          </div>
        </div>
      </div>
    </article>
  );
}
