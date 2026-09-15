import React from "react";
import { useCart } from "../hooks/useCart.jsx";
import { formatRupees } from "../utils/format.js";

export default function CartRow({ item }) {
  const { setQty, remove } = useCart();

  return (
    <li className="cart-item">
      <figure className="cart-item-media">
        <img src={item.image} alt={`${item.name} pack`} loading="lazy" />
      </figure>

      <div className="cart-item-body">
        <p className="cart-item-tag">{item.tag}</p>
        <h2 className="cart-item-name">{item.name}</h2>
        <p className="cart-item-unit">{formatRupees(item.price)} / 10 kg</p>
      </div>

      <div className="cart-item-actions">
        <div className="qty" role="group" aria-label={`Quantity for ${item.name}`}>
          {/* Dropping below 1 removes the line, as the original setQty did. */}
          <button
            className="qty-btn"
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty(item.id, item.qty - 1)}
          >
            &minus;
          </button>
          <span className="qty-value">{item.qty}</span>
          <button
            className="qty-btn"
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty(item.id, item.qty + 1)}
          >
            +
          </button>
        </div>

        <p className="cart-item-total">{formatRupees(item.price * item.qty)}</p>
        <button className="remove-btn" type="button" onClick={() => remove(item.id)}>
          Remove
        </button>
      </div>
    </li>
  );
}
