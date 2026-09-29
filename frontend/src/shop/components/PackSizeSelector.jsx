import React from "react";
import { formatRupees } from "../utils/format.js";
import { showCardPrices } from "../../config.js";

export default function PackSizeSelector({ sizes, selectedKg, onSelect }) {
  return (
    <div className="pdp-pack-sizes" role="group" aria-label="Select pack size">
      {sizes.map((size) => (
        <button
          key={size.kg}
          type="button"
          className={`pdp-pack-pill${size.kg === selectedKg ? " is-selected" : ""}`}
          aria-pressed={size.kg === selectedKg}
          onClick={() => onSelect(size.kg)}
        >
          <span className="pdp-pack-kg">{size.kg} KG</span>
          {/* Omitted rather than shown as ₹0 while prices are unpublished. */}
          {showCardPrices && <span className="pdp-pack-price">{formatRupees(size.price)}</span>}
        </button>
      ))}
    </div>
  );
}
