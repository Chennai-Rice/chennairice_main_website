import React from "react";
import { Link } from "react-router-dom";
import CardQuantityControl from "./CardQuantityControl.jsx";
import { formatRupees } from "../utils/format.js";

export default function RelatedProducts({ products }) {
  if (products.length === 0) return null;

  return (
    <div className="pdp-related-track">
      {products.map((product) => {
        const defaultSize = product.packSizes.find((s) => s.kg === 10) || product.packSizes[0];
        const cartProduct = {
          ...product,
          id: `${product.id}-${defaultSize.kg}kg`,
          name: `${product.name} (${defaultSize.kg} kg)`,
          price: defaultSize.price,
        };
        return (
          <article className="pdp-related-card" key={product.id}>
            <Link to={`/products/${product.id}`} className="pdp-related-media">
              <img src={product.image} alt={product.alt} loading="lazy" />
            </Link>
            <Link to={`/products/${product.id}`} className="pdp-related-name">
              {product.name}
            </Link>
            <p className="pdp-related-tag">{product.tag}</p>
            <p className="pdp-related-price">
              {formatRupees(defaultSize.price)} <span>/ {defaultSize.kg} kg</span>
            </p>
            <CardQuantityControl product={cartProduct} />
          </article>
        );
      })}
    </div>
  );
}
