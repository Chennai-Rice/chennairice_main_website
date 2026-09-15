import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import PackSizeSelector from "../components/PackSizeSelector.jsx";
import QuantitySelector from "../components/QuantitySelector.jsx";
import ProductTabs from "../components/ProductTabs.jsx";
import JourneyTimeline from "../components/JourneyTimeline.jsx";
import RecipeTeaser from "../components/RecipeTeaser.jsx";
import RelatedProducts from "../components/RelatedProducts.jsx";
import BulkOrderCTA from "../components/BulkOrderCTA.jsx";
import { useProduct, useProducts } from "../data/products.js";
import { getDetails, getCategoryLabel, GRAIN_JOURNEY, GALLERY_EXTRAS } from "../data/productDetails.js";
import { useCart } from "../hooks/useCart.jsx";
import { useWishlist } from "../hooks/useWishlist.jsx";
import { useRipple } from "../hooks/useRipple.js";
import { formatRupees } from "../utils/format.js";
import usePageMeta from "../hooks/usePageMeta.js";
import "./productdetail.css";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, items } = useCart();
  const wishlist = useWishlist();
  const spawnRipple = useRipple();

  const { product, loading } = useProduct(id);
  const { products: allProducts } = useProducts();

  const sizes = product?.packSizes || [];
  const defaultSize = sizes.find((s) => s.kg === 10) || sizes[0];
  const [selectedKg, setSelectedKg] = useState(defaultSize?.kg);
  const [qty, setQty] = useState(1);
  // Saved state lives in the shared store, so it persists and the header
  // badge stays in step.
  const wishlisted = wishlist.has(id);

  usePageMeta(
    product ? `${product.name} — Chennai Rice Industries` : "Product — Chennai Rice Industries",
    product ? product.description : undefined
  );

  // Pack size defaults to 10 kg once the product has loaded — keep the
  // selector in sync instead of getting stuck on the pre-load undefined.
  useEffect(() => {
    if (defaultSize && selectedKg === undefined) setSelectedKg(defaultSize.kg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSize]);

  if (loading) {
    return <SiteLayout skipTo="pdp-main" skipLabel="Skip to content"><main id="pdp-main" className="pdp" /></SiteLayout>;
  }

  if (!product) {
    return (
      <SiteLayout skipTo="pdp-main" skipLabel="Skip to content">
        <main id="pdp-main" className="pdp-not-found">
          <h1>Product not found</h1>
          <p>We couldn't find that pack. It may have been renamed or removed.</p>
          <Link className="btn-maroon" to="/products">
            Back to Products
          </Link>
        </main>
      </SiteLayout>
    );
  }

  const selected = sizes.find((s) => s.kg === selectedKg) || defaultSize;
  const category = getCategoryLabel(product);
  const details = getDetails(product.id);
  const inCart = items.find((item) => item.id === `${product.id}-${selected.kg}kg`);

  const galleryImages = [{ src: product.image, alt: product.alt }, ...GALLERY_EXTRAS];

  const cartProduct = {
    ...product,
    id: `${product.id}-${selected.kg}kg`,
    name: `${product.name} (${selected.kg} kg)`,
    price: selected.price,
  };

  const handleAddToCart = (event) => {
    spawnRipple(event);
    for (let i = 0; i < qty; i += 1) add(cartProduct);
  };

  const handleBuyNow = (event) => {
    handleAddToCart(event);
    navigate("/cart");
  };

  const related = allProducts.filter((p) => p.id !== product.id);

  return (
    <SiteLayout skipTo="pdp-main" skipLabel="Skip to product">
      <main id="pdp-main" className="pdp">
        <div className="pdp-top">
          <Link className="pdp-back" to="/products">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5L8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Products
          </Link>
          <Breadcrumb
            items={[
              { label: "Home", to: "/" },
              { label: "Products", to: "/products" },
              { label: category, to: "/products" },
              { label: product.name },
            ]}
          />
        </div>

        <section className="pdp-hero">
          <ProductGallery images={galleryImages} alt={product.alt} />

          <div className="pdp-info">
            <span className="pdp-badge">Premium Quality</span>
            <h1 className="pdp-title">{product.name}</h1>
            <p className="pdp-subtitle">{category}</p>
            <p className="pdp-desc">{product.description}</p>

            <div className="pdp-price-hero">
              <span className="pdp-price">{formatRupees(selected.price * qty)}</span>
              <span className="pdp-price-note">Inclusive of applicable taxes</span>
            </div>

            <div className="pdp-divider" />

            <div className="pdp-section-label">Select Pack Size</div>
            <PackSizeSelector sizes={sizes} selectedKg={selectedKg} onSelect={(kg) => setSelectedKg(kg)} />

            <div className="pdp-qty-row">
              <span className="pdp-section-label">Quantity</span>
              <QuantitySelector qty={qty} onChange={setQty} />
            </div>

            <div className="pdp-cta-row">
              <button type="button" className="btn-maroon pdp-add-btn" onClick={handleAddToCart}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6h15l-1.5 9h-12z M6 6l-1-3H2 M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                {inCart ? "Add Another" : "Add to Cart"}
              </button>
              <button type="button" className="btn-outline" onClick={handleBuyNow}>
                Buy Now
              </button>
              <button
                type="button"
                className={`pdp-wishlist${wishlisted ? " is-active" : ""}`}
                aria-pressed={wishlisted}
                aria-label={wishlisted ? "Remove from saved items" : "Save to wishlist"}
                onClick={() => wishlist.toggle(id)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} aria-hidden="true">
                  <path
                    d="M12 20s-7-4.35-9.5-8.5C1 8 2.5 4.5 6 4c2-.3 3.8.8 6 3 2.2-2.2 4-3.3 6-3 3.5.5 5 4 3.5 7.5C19 15.65 12 20 12 20z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <Link className="pdp-bulk-link" to="/contact">
              Bulk Order Enquiry &rarr;
            </Link>
          </div>
        </section>

        <section className="pdp-section">
          <ProductTabs product={product} details={details} />
        </section>

        <section className="pdp-section pdp-journey-section">
          <div className="pdp-section-head">
            <span className="pdp-section-eyebrow">From Field to Family</span>
            <h2>The Journey of Every Grain</h2>
          </div>
          <JourneyTimeline steps={GRAIN_JOURNEY} />
        </section>

        <section className="pdp-section">
          <div className="pdp-section-head">
            <h2>Made for Your Everyday Table</h2>
          </div>
          <RecipeTeaser />
        </section>

        {related.length > 0 && (
          <section className="pdp-section">
            <div className="pdp-section-head">
              <h2>You May Also Like</h2>
            </div>
            <RelatedProducts products={related} />
          </section>
        )}

        <section className="pdp-section">
          <BulkOrderCTA />
        </section>
      </main>
    </SiteLayout>
  );
}
