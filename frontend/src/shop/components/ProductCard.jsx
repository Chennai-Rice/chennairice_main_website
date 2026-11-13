import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import CardQuantityControl from "./CardQuantityControl.jsx";
import { useRipple } from "../hooks/useRipple.js";
import { formatRupees } from "../utils/format.js";
import { showCardPrices } from "../../config.js";
import { PRODUCT_SEO, productPath } from "../../seo.js";
import "./productcard-contest.css";

// The pack that carries the Super Slogan Contest coupon gets its own card
// treatment: a contest ribbon, a gold frame and a glow behind the pack.
const CONTEST_ID = "kitchidi-ponni-rice";

export default function ProductCard({ product }) {
  const spawnRipple = useRipple();
  const contest = product.id === CONTEST_ID;

  const sizes = product.packSizes || [{ kg: 10, price: product.price }];
  // Open on the 10 kg pack when it can be bought, else the first size that
  // can, so a card never opens on a sold-out size when another is available.
  const buyable = sizes.filter((s) => s.inStock !== false);
  const defaultSize = buyable.find((s) => s.kg === 10) || buyable[0] || sizes.find((s) => s.kg === 10) || sizes[0];
  const [selectedKg, setSelectedKg] = useState(defaultSize.kg);
  const selected = sizes.find((s) => s.kg === selectedKg) || defaultSize;
  // inStock is only known when the catalog comes from the sales backend;
  // undefined (Supabase / bundled packs) means "assume available".
  const soldOut = selected.inStock === false;
  const allSoldOut = product.inStock === false;

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
    <article className={`card card--${product.variant}${contest ? " card--contest" : ""}`}>
      {contest && (
        <Link className="card-contest-ribbon" to="/contest" tabIndex={-1}>
          <span className="card-contest-orn" aria-hidden="true">&#10022;</span>
          <span className="card-contest-text">
            <span className="card-contest-title">Super Slogan Contest</span>
            <span className="card-contest-sub">Coupon inside</span>
          </span>
          <span className="card-contest-orn" aria-hidden="true">&#10022;</span>
        </Link>
      )}
      <figure className="card-media">
        {product.flag && <span className="premium-flag">{product.flag}</span>}
        {allSoldOut && <span className="stock-flag">Out of stock</span>}

        {/* The pack photo opens this product's page, like "View more". It is
            left out of the tab order since that button already leads there. */}
        <Link className="card-media-link" to={productPath(product.id)} tabIndex={-1}>
          <img
            src={product.image}
            alt={product.alt}
            width={product.width}
            height={product.height}
            loading="lazy"
          />
        </Link>
      </figure>
      <div className="card-body">
        <p className="card-tag">{product.tag}</p>
        <h3 className="card-title">{PRODUCT_SEO[product.id]?.name || product.name}</h3>
        <p className="card-desc">{PRODUCT_SEO[product.id]?.line || product.description}</p>

        <div className="pack-size-group" role="group" aria-label={`Pack size for ${product.name}`}>
          {sizes.map((size) => (
            <button
              key={size.kg}
              type="button"
              className={`pack-size-pill${size.kg === selectedKg ? " is-selected" : ""}${size.inStock === false ? " is-soldout" : ""}`}
              aria-pressed={size.kg === selectedKg}
              onClick={() => setSelectedKg(size.kg)}
            >
              {size.kg} kg
              {size.inStock === false && <span className="visually-hidden"> (out of stock)</span>}
            </button>
          ))}
        </div>

        {/* With prices off the card becomes a catalogue entry: the pack sizes
            above still say what exists, and the price and the cart give way to
            a route to the sales team. */}
        <div className={`card-foot${showCardPrices ? "" : " card-foot--enquiry"}`}>
          {showCardPrices && soldOut && selected.price == null ? (
            <p className="price-enquiry">
              <span className="price-enquiry-label price-soldout">Out of stock</span>
              <span className="price-unit">{selected.kg} kg pack</span>
            </p>
          ) : showCardPrices && soldOut ? (
            // Sold out still shows what the pack costs; the stock is a note.
            <p className="price">
              {selected.mrp && <s className="price-mrp" aria-label={`Was ${formatRupees(selected.mrp)}`}>{formatRupees(selected.mrp)}</s>}
              <span className="price-amount">{formatRupees(selected.price)}</span>{" "}
              <span className="price-unit">/ {selected.kg} kg</span>
              <span className="price-stock-note">Out of stock</span>
            </p>
          ) : showCardPrices ? (
            <p className="price">
              {selected.mrp && <s className="price-mrp" aria-label={`Was ${formatRupees(selected.mrp)}`}>{formatRupees(selected.mrp)}</s>}
              <span className="price-amount">{formatRupees(selected.price)}</span>{" "}
              <span className="price-unit">/ {selected.kg} kg</span>
            </p>
          ) : (
            <p className="price-enquiry">
              <span className="price-enquiry-label">Price on request</span>
              <span className="price-unit">{selected.kg} kg pack</span>
            </p>
          )}
          <div className="card-actions">
            <Link className="view-btn" to={productPath(product.id)} onClick={spawnRipple}>
              View more
            </Link>
            {showCardPrices && soldOut ? (
              <button className="add-btn add-btn--soldout" type="button" disabled>
                <span className="add-label">Out of stock</span>
              </button>
            ) : showCardPrices ? (
              <CardQuantityControl product={cartProduct} />
            ) : (
              <Link
                className="add-btn contact-sales-btn"
                to="/contact-us"
                onClick={spawnRipple}
                aria-label={`Contact sales about ${product.name}`}
              >
                Contact sales
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
