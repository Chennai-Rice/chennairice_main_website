import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import PackSizeSelector from "../components/PackSizeSelector.jsx";
import QuantitySelector from "../components/QuantitySelector.jsx";
import ProductTabs, { ProductAbout } from "../components/ProductTabs.jsx";
import JourneyTimeline from "../components/JourneyTimeline.jsx";
import RecipeTeaser from "../components/RecipeTeaser.jsx";
import RelatedProducts from "../components/RelatedProducts.jsx";
import BulkOrderCTA from "../components/BulkOrderCTA.jsx";
import CheckoutBar from "../components/CheckoutBar.jsx";
import ShareButton from "../components/ShareButton.jsx";
import { useProduct, useProducts } from "../data/products.js";
import { getDetails, getCategoryLabel, GRAIN_JOURNEY } from "../data/productDetails.js";
import { useCart } from "../hooks/useCart.jsx";
import { useWishlist } from "../hooks/useWishlist.jsx";
import { useRipple } from "../hooks/useRipple.js";
import { formatRupees } from "../utils/format.js";
import { showCardPrices } from "../../config.js";
import usePageMeta from "../hooks/usePageMeta.js";
import { trackMetaEvent } from "../../services/metaPixel.js";
import { PRODUCT_SEO, productIdFromSlug, productName, productPath } from "../../seo.js";
import { FOOTER } from "../../data/content.js";
import "./productdetail.css";

export default function ProductDetailPage() {
  const { id: slug } = useParams();
  const id = productIdFromSlug(slug);
  const navigate = useNavigate();
  const { add, items } = useCart();
  const wishlist = useWishlist();
  const spawnRipple = useRipple();

  const { product, loading } = useProduct(id);
  const { products: allProducts } = useProducts();

  const sizes = product?.packSizes || [];
  // Prefer a size that can actually be bought (inStock is only known when
  // the catalog comes from the sales backend; undefined means available).
  const buyable = sizes.filter((s) => s.inStock !== false);
  const defaultSize = buyable.find((s) => s.kg === 10) || buyable[0] || sizes.find((s) => s.kg === 10) || sizes[0];
  const [selectedKg, setSelectedKg] = useState(defaultSize?.kg);
  const [qty, setQty] = useState(1);
  // Saved state lives in the shared store, so it persists and the header
  // badge stays in step.
  const wishlisted = wishlist.has(id);

  const seo = PRODUCT_SEO[id];
  usePageMeta(
    seo?.title || (product ? `${product.name} — Chennai Rice Industries` : "Product — Chennai Rice Industries"),
    seo?.description || (product ? product.description : undefined)
  );

  // Google's Product structured data, with the live pack prices (so it can
  // never disagree with the page). The page's breadcrumb is in its HTML
  // (scripts/prerender-head.mjs).
  useEffect(() => {
    if (!product) return undefined;
    const site = "https://chennairiceindustries.com";
    const priced = showCardPrices ? sizes.filter((s) => typeof s.price === "number" && s.price > 0) : [];
    const prices = priced.map((s) => s.price);
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: productName(id) || product.name,
      description: seo?.description || product.description,
      image: product.image ? [new URL(product.image, site).href] : undefined,
      sku: product.id,
      brand: { "@type": "Brand", name: "Chennai Rice" },
      url: site + productPath(product.id),
      ...(prices.length && {
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
          availability: priced.some((s) => s.inStock !== false)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          seller: { "@id": site + "/#organization" },
        },
      }),
    };
    const tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = "product-schema";
    tag.textContent = JSON.stringify(data);
    document.getElementById("product-schema")?.remove();
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [product, sizes, seo]);

  // Meta: this product was viewed (once per product, with the pack size shown first).
  const viewedId = product?.id;
  const viewedPrice = defaultSize?.price;
  useEffect(() => {
    if (!viewedId) return;
    trackMetaEvent("ViewContent", {
      content_ids: [viewedId], content_name: product.name, content_type: "product",
      value: viewedPrice, currency: "INR",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId]);

  // Pack size defaults to 10 kg once the product has loaded — keep the
  // selector in sync instead of getting stuck on the pre-load undefined.
  useEffect(() => {
    if (defaultSize && selectedKg === undefined) setSelectedKg(defaultSize.kg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSize]);

  if (productPath(id) !== `/products/${slug}`) {
    return <Navigate to={productPath(id)} replace />;
  }

  if (loading) {
    return <SiteLayout skipTo="pdp-main" skipLabel="Skip to content"><main id="pdp-main" className="pdp" /></SiteLayout>;
  }

  if (!product) {
    return (
      <SiteLayout skipTo="pdp-main" skipLabel="Skip to content">
        <main id="pdp-main" className="pdp-not-found">
          <h1>Product not found</h1>
          <p>We couldn't find that pack. It may have been renamed or removed.</p>
          <Link className="btn-maroon" to="/rice-products">
            Back to Products
          </Link>
        </main>
      </SiteLayout>
    );
  }

  const selected = sizes.find((s) => s.kg === selectedKg) || defaultSize;
  const soldOut = selected?.inStock === false;
  const category = getCategoryLabel(product);
  const details = getDetails(product.id);
  const inCart = items.find((item) => item.id === `${product.id}-${selected.kg}kg`);

  // Just the pack photo: the grain / field / cooked-rice extras were removed (owner, Oct 2026).
  const galleryImages = [{ src: product.image, alt: product.alt }];

  const cartProduct = {
    ...product,
    id: `${product.id}-${selected.kg}kg`,
    name: `${product.name} (${selected.kg} kg)`,
    price: selected.price,
    // Carried so the cart can price against the size actually bought. Without
    // it CartRow fell back to a hardcoded "/ 10 kg" for every line, which
    // misstated the basis on the 5 kg, 25 kg and 26 kg packs.
    packKg: selected.kg,
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

  // Headings follow "Chennai Rice SEO - Product Page": the H1 is the product's
  // heading name and the sections say "<name> Rice" ("Special Idly Rice"
  // already ends in Rice).
  const festive = id === "kitchidi-ponni-rice";
  const headName = seo?.name || product.name;
  const riceName = /rice$/i.test(headName) ? headName : `${headName} Rice`;

  return (
    <SiteLayout skipTo="pdp-main" skipLabel="Skip to product">
      <main id="pdp-main" className={`pdp${festive ? " pdp-festive" : ""}`}>
        {/* The Kitchidi Ponni pack carries the festive garland in both top
            corners: one artwork, the left copy mirrored in CSS. */}
        {festive && (
          <>
            <img className="pdp-garland pdp-garland-right" src="/image.png" alt="" aria-hidden="true" />
            <img className="pdp-garland pdp-garland-left" src="/image.png" alt="" aria-hidden="true" />
          </>
        )}
        <div className="pdp-top">
          <Link className="pdp-back" to="/rice-products">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5L8 12l7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Products
          </Link>
          <Breadcrumb
            items={[
              { label: "Home", to: "/" },
              { label: "Products", to: "/rice-products" },
              { label: category, to: "/rice-products" },
              { label: product.name },
            ]}
          />
        </div>

        <section className="pdp-hero">
          <ProductGallery images={galleryImages} alt={product.alt} peek={festive} />

          <div className="pdp-info">
            {/* The Kitchidi Ponni pack carries the contest coupon, so its page
                opens with the contest title, linking to the full contest page. */}
            {festive && (
              <Link className="pdp-contest" to="/contest">
                <span className="pdp-contest-rule" aria-hidden="true"><i /><b /><i /></span>
                <span className="pdp-contest-title">Super Slogan Contest</span>
                <span className="pdp-contest-sub">
                  Coupon inside every 5&nbsp;kg &amp; 26&nbsp;kg bag
                </span>
                <span className="pdp-contest-rule" aria-hidden="true"><i /><b /><i /></span>
              </Link>
            )}
            <span className="pdp-badge">Premium Quality</span>
            {/* The SEO heading ends in a pack size ("… – 26 kg"); it follows the size chosen below. */}
            <h1 className={`pdp-title${(seo?.h1 || "").length > 32 ? " pdp-title--long" : ""}`}>
              {seo?.h1
                ? (selected ? seo.h1.replace(/ – \d+ kg$/, ` – ${Number(selected.kg)} kg`) : seo.h1)
                : headName}
            </h1>
            <p className="pdp-subtitle">{category}</p>
            <p className="pdp-desc">{seo?.intro || seo?.line || product.description}</p>

            {/* While prices are unpublished this reads "Price on request" and
                points at the sales team, rather than showing the ₹0 that every
                variant currently carries. */}
            <div className="pdp-price-hero">
              {showCardPrices ? (
                <>
                  {selected.mrp && (
                    <s className="pdp-price-mrp" aria-label={`Was ${formatRupees(selected.mrp * (soldOut ? 1 : qty))}`}>
                      {formatRupees(selected.mrp * (soldOut ? 1 : qty))}
                    </s>
                  )}
                  <span className="pdp-price">
                    {soldOut && selected.price == null ? "Out of stock" : formatRupees(selected.price * (soldOut ? 1 : qty))}
                  </span>
                </>
              ) : (
                <>
                  <span className="pdp-price">Price on request</span>
                  <span className="pdp-price-note">
                    Our sales team will confirm pricing for this pack.
                  </span>
                </>
              )}
            </div>

            <div className="pdp-divider" />

            {/* Pack size and quantity. Stacked by default; the Kitchidi Ponni
                page sets them side by side to keep its first screen compact. */}
            <div className="pdp-options">
              <div className="pdp-option-size">
                <div className="pdp-section-label">Select Pack Size</div>
                <PackSizeSelector sizes={sizes} selectedKg={selectedKg} onSelect={(kg) => setSelectedKg(kg)} />
              </div>

              <div className="pdp-qty-row">
                <span className="pdp-section-label">Quantity</span>
                <QuantitySelector qty={qty} onChange={setQty} />
              </div>
            </div>

            <div className="pdp-cta-row">
              {/* Buying needs a price. While there isn't one, the only honest
                  call to action is a route to the people who can quote it. */}
              {showCardPrices ? (
                <>
                  <button type="button" className="btn-maroon pdp-add-btn" onClick={handleAddToCart} disabled={soldOut}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6h15l-1.5 9h-12z M6 6l-1-3H2 M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                    {soldOut ? "Out of stock" : inCart ? "Add Another" : "Add to Cart"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleBuyNow} disabled={soldOut}>
                    Buy Now
                  </button>
                </>
              ) : (
                <Link className="btn-maroon pdp-add-btn" to="/contact-us">
                  Contact sales
                </Link>
              )}
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
              <ShareButton title={`${product.name} | Chennai Rice`} text={`${product.name} from Chennai Rice`} />
            </div>

            <Link className="pdp-bulk-link" to="/contact-us">
              Bulk Order Enquiry &rarr;
            </Link>

            {/* Food safety licence, where the buying decision is made. */}
            <p className="pdp-fssai">
              <img src="/assets/fssai-logo.png" alt="FSSAI" width="835" height="458" loading="lazy" />
              <span>FSSAI Lic. No. <strong>{FOOTER.fssai}</strong></span>
            </p>
          </div>
        </section>

        <section className="pdp-section">
          <ProductAbout product={product} details={details} riceName={riceName} about={seo?.about} />
        </section>

        <section className="pdp-section">
          <div className="pdp-section-head">
            <h2>{riceName} Product Description</h2>
          </div>
          <ProductTabs product={product} details={details} riceName={riceName} />
        </section>

        <section className="pdp-section pdp-journey-section">
          <div className="pdp-section-head">
            <span className="pdp-section-eyebrow">From Field to Family</span>
            <h2>From Paddy to Pack: How Rice Is Made</h2>
          </div>
          <JourneyTimeline steps={GRAIN_JOURNEY} />
        </section>

        <section className="pdp-section">
          <div className="pdp-section-head">
            <h2>Best Dishes to Cook with {riceName}</h2>
          </div>
          <RecipeTeaser dishes={seo?.dishes} />
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
      {showCardPrices && <CheckoutBar />}
    </SiteLayout>
  );
}
