import React, { useMemo } from "react";
import ProductCard from "../components/ProductCard.jsx";
import CartButton from "../components/CartButton.jsx";
import { FILTERS, useProducts } from "../data/products.js";

/**
 * Search box and filter chips feed one derived list, exactly as the original
 * single filterProducts() pass did — a card shows only if it satisfies the
 * active chip AND the search text.
 *
 * The original toggled `hidden` on each <li>; here the list is simply filtered,
 * which is why the CSS guard `.product-grid > li[hidden]` is no longer relied
 * upon (it stays in the stylesheet harmlessly).
 */
export default function ProductGrid({ search, activeFilter, onFilterChange }) {
  const { products, loading, error } = useProducts();

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesChip = activeFilter === "all" || product.tags.includes(activeFilter);
      const haystack = `${product.search} ${product.name} ${product.description}`.toLowerCase();
      return matchesChip && haystack.includes(query);
    });
  }, [products, search, activeFilter]);

  const note =
    visible.length === products.length
      ? `Showing ${visible.length} products`
      : `Showing ${visible.length} of ${products.length} products`;

  return (
    <section className="products" id="products" aria-labelledby="products-heading">
      <div className="products-head">
        <div className="products-head-top">
          <h2 id="products-heading">Our 10&nbsp;kg packs</h2>
          <div className="products-head-note-group">
            <p className="results-note" aria-live="polite">
              {note}
            </p>
            <CartButton />
          </div>
        </div>
        <div className="filters" role="group" aria-label="Filter packs by variety">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              className="chip"
              type="button"
              aria-pressed={activeFilter === filter.id}
              onClick={() => onFilterChange(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && (
        <ul className="product-grid">
          {visible.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="no-results">
          No packs match this filter and search. Choose &ldquo;All packs&rdquo; or clear the search box.
        </p>
      )}

      {error && (
        <p className="no-results">
          We couldn&rsquo;t load our packs right now. Please refresh, or check back shortly.
        </p>
      )}
    </section>
  );
}
