import React from "react";

export default function PackSizeSelector({ sizes, selectedKg, onSelect }) {
  return (
    <div className="pdp-pack-sizes" role="group" aria-label="Select pack size">
      {sizes.map((size) => (
        <button
          key={size.kg}
          type="button"
          className={`pdp-pack-pill${size.kg === selectedKg ? " is-selected" : ""}${size.inStock === false ? " is-soldout" : ""}`}
          aria-pressed={size.kg === selectedKg}
          onClick={() => onSelect(size.kg)}
        >
          <span className="pdp-pack-kg">{size.kg} KG</span>
          {/* Just the size: the price shows once, above (owner, Oct 2026).
              A sold-out size still says so. */}
          {(size.price == null || size.inStock === false) && (
            <small className="pdp-pack-stock">Out of stock</small>
          )}
        </button>
      ))}
    </div>
  );
}
