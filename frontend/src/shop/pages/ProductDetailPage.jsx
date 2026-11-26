import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import SiteLayout from "../layouts/SiteLayout.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import ProductGallery from "../components/ProductGallery.jsx";
import PackSizeSelector from "../components/PackSizeSelector.jsx";
import QuantitySelector from "../components/QuantitySelector.jsx";
import ProductTabs, { ProductAbout } from "../components/ProductTabs.jsx";
import JourneyRoad from "../components/JourneyRoad.jsx";
import "../components/journeyroad.css";
import RecipeTeaser from "../components/RecipeTeaser.jsx";
import RelatedProducts from "../components/RelatedProducts.jsx";
import ProductReviews from "../components/ProductReviews.jsx";
import { packOffers, productReviews, reviewSchema, averageRating } from "../../productSchema.js";
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
import { trackGoogleEcommerce, gaItem } from "../../services/googleAnalytics.js";
import { PRODUCT_SEO, productIdFromSlug, productName, productPath } from "../../seo.js";
import { whatsappOrderLink } from "../../components/ActionBar.jsx";
import { FOOTER } from "../../data/content.js";
import { flyToCart } from "../utils/flyToCart.js";
import "./productdetail.css";

export default function ProductDetailPage() {
  const { id: slug } = useParams();
  const id = productIdFromSlug(slug);
  const navigate = useNavigate();
  const { add, items, setQty: setCartQty } = useCart();
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
  // Phones: a buy bar fixed to the bottom whenever the page's own Add to cart / Buy now
  // row is off screen (people arriving from an ad can buy without scrolling).
  const [ctaInView, setCtaInView] = useState(true);
  const ctaObserver = useRef(null);
  const ctaRef = useCallback((el) => {
    ctaObserver.current?.disconnect();
    if (!el || typeof IntersectionObserver === "undefined") return;
    ctaObserver.current = new IntersectionObserver(([e]) => setCtaInView(e.isIntersecting), { rootMargin: "0px 0px -40px 0px" });
    ctaObserver.current.observe(el);
  }, []);

  const seo = PRODUCT_SEO[id];
  usePageMeta(
    seo?.title || (product ? `${product.name} — Chennai Rice Industries` : "Product — Chennai Rice Industries"),
    seo?.description || (product ? product.description : undefined)
  );

  // Published customer reviews of this product (GET /api/reviews): shown on the page and in its Product data.
  const [allReviews, setAllReviews] = useState([]);
  useEffect(() => {
    let live = true;
    fetch("/api/reviews", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((j) => { if (live) setAllReviews(j.reviews || []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const ownReviews = product ? productReviews(allReviews, productName(id) || product.name, seo?.h1, product.name) : [];

  // Google's Product structured data, with the live pack prices (so it can
  // never disagree with the page). The page's breadcrumb is in its HTML
  // (scripts/prerender-head.mjs).
  useEffect(() => {
    if (!product) return undefined;
    const site = "https://chennairiceindustries.com";
    const priced = showCardPrices ? sizes.filter((s) => typeof s.price === "number" && s.price > 0) : [];
    const offers = packOffers(priced, site + productPath(product.id));
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      // Same @id as the Product in the page HTML (scripts/prerender-content.mjs), so the two merge.
      "@id": site + productPath(product.id) + "#product",
      manufacturer: { "@id": site + "/#organization" },
      name: productName(id) || product.name,
      description: seo?.description || product.description,
      image: product.image ? [new URL(product.image, site).href] : undefined,
      sku: product.id,
      brand: { "@type": "Brand", name: "Chennai Rice" },
      url: site + productPath(product.id),
      // One Offer per pack with delivery by region and the return policy; stars only from real reviews
      // (the same builder as the pre-rendered page, productSchema.js).
      ...(offers.length && { offers }),
      ...reviewSchema(ownReviews),
    };
    const tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = "product-schema";
    tag.textContent = JSON.stringify(data);
    document.getElementById("product-schema")?.remove();
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [product, sizes, seo, ownReviews.length]);

  // Meta: this product was viewed (once per product, with the pack size shown first).
  // Sent only once that pack's price has loaded: Meta needs a value above zero.
  const viewedId = product?.id;
  const viewedPrice = Number(defaultSize?.price) || 0;
  const viewSent = useRef(null);
  useEffect(() => {
    if (!viewedId || viewedPrice <= 0 || viewSent.current === viewedId) return;
    viewSent.current = viewedId;
    trackMetaEvent("ViewContent", {
      content_ids: [viewedId], content_name: product.name, content_type: "product",
      value: viewedPrice, currency: "INR",
    });
    // GA4 view_item, once per product, with the pack shown first (Nov 2026).
    trackGoogleEcommerce("view_item", {
      items: [gaItem({ slug: viewedId, kg: defaultSize?.kg, name: product.name, price: viewedPrice })],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId, viewedPrice]);

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
    // A screen-high empty page while the packs load: an empty one let the footer show at the top and jump away
    // when the product appeared (most of the Kitchidi page's mobile layout shift, audit 25 Nov 2026).
    return <SiteLayout skipTo="pdp-main" skipLabel="Skip to content"><main id="pdp-main" className="pdp" style={{ minHeight: "100vh" }} /></SiteLayout>;
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

  // A pack size chosen on the page or in the sticky bar: the price follows, and GA4 hears which size (Nov 2026).
  const choosePack = (kg) => {
    if (kg === selected.kg) return;
    setSelectedKg(kg);
    const s = sizes.find((x) => x.kg === kg);
    if (s) trackGoogleEcommerce("select_pack_size", { items: [gaItem({ slug: product.id, kg, name: product.name, price: s.price })], pack_size: `${kg} kg` });
  };

  const handleAddToCart = (event) => {
    spawnRipple(event);
    // The bag picture flies down into the cart bar (not when "Buy now" is leaving the page anyway).
    if (event?.currentTarget?.classList?.contains("pdp-add-btn")) {
      flyToCart(document.querySelector(".pdp-gallery-main img:not(.pdp-peek-mascot)"));
    }
    for (let i = 0; i < qty; i += 1) add(cartProduct);
  };

  const handleBuyNow = (event) => {
    // Already in the cart: go there with the quantity chosen beside "Added".
    if (!inCart) handleAddToCart(event);
    navigate("/cart");
  };

  // Other packs, leaving out ones with no size in stock (audit, 25 Nov 2026).
  const related = allProducts.filter((p) => p.id !== product.id && p.packSizes?.some((s) => s.inStock !== false));

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
            <img className="pdp-garland pdp-garland-right" src="/assets/garland-v2.webp" alt="" aria-hidden="true" />
            <img className="pdp-garland pdp-garland-left" src="/assets/garland-v2.webp" alt="" aria-hidden="true" />
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
              // The category opens its own hub page (audit, 25 Nov 2026): idli rice → /idli-rice, Ponni → /ponni-rice.
              { label: category, to: product.id === "special-idly-rice" ? "/idli-rice" : "/ponni-rice" },
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
                    {soldOut && selected.price == null ? (product.offline ? "Price unavailable" : "Out of stock") : formatRupees(selected.price * (soldOut ? 1 : qty))}
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
                <PackSizeSelector sizes={sizes} selectedKg={selectedKg} onSelect={choosePack} />
              </div>

              <div className="pdp-qty-row">
                <span className="pdp-section-label">{inCart ? "In your cart" : "Quantity"}</span>
                {/* Once this pack is in the cart, the stepper is the cart's own quantity (0 removes it). */}
                {inCart ? (
                  <QuantitySelector qty={inCart.qty} onChange={(n) => setCartQty(inCart.id, n)} min={0} />
                ) : (
                  <QuantitySelector qty={qty} onChange={setQty} />
                )}
              </div>
            </div>

            <div className="pdp-cta-row" ref={ctaRef}>
              {/* Buying needs a price. While there isn't one, the only honest
                  call to action is a route to the people who can quote it. */}
              {showCardPrices ? (
                <>
                  <button
                    type="button"
                    className={`btn-maroon pdp-add-btn${inCart ? " is-added" : ""}`}
                    onClick={inCart ? () => navigate("/cart") : handleAddToCart}
                    disabled={soldOut}
                    title={inCart ? "In your cart — change the quantity beside it, or tap to view the cart" : undefined}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6h15l-1.5 9h-12z M6 6l-1-3H2 M9 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                    {soldOut ? "Out of stock" : inCart ? "Added ✓" : "Add to Cart"}
                  </button>
                  <button type="button" className="btn-outline pdp-buy-btn" onClick={handleBuyNow} disabled={soldOut}>
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

            <Link
              className="pdp-bulk-link"
              to={`/bulk-order?product=${encodeURIComponent(product.name)}${selected?.kg ? `&size=${selected.kg}` : ""}`}
            >
              Bulk Order Enquiry &rarr;
            </Link>

            {/* Food safety licence, where the buying decision is made. */}
            <p className="pdp-fssai">
              <img src="/assets/fssai-logo-v2.webp" alt="FSSAI" width="835" height="458" loading="lazy" />
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
          <JourneyRoad steps={GRAIN_JOURNEY} />
        </section>

        <section className="pdp-section">
          <div className="pdp-section-head">
            <h2>Best Dishes to Cook with {riceName}</h2>
          </div>
          <RecipeTeaser dishes={seo?.dishes} />
        </section>

        {ownReviews.length > 0 && (
          <section className="pdp-section">
            <div className="pdp-section-head">
              <h2>Customer Reviews of {riceName}</h2>
            </div>
            <ProductReviews reviews={ownReviews} average={averageRating(ownReviews)} riceName={riceName} />
          </section>
        )}

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
      {showCardPrices && (
        <div className={`pdp-buybar${ctaInView ? "" : " is-shown"}`} aria-hidden={ctaInView}>
          <label className="pdp-buybar-pack">
            <span className="sr-only">Pack size</span>
            <select value={selected.kg} onChange={(e) => choosePack(Number(e.target.value))} tabIndex={ctaInView ? -1 : 0}>
              {sizes.map((s) => (
                <option key={s.kg} value={s.kg} disabled={s.inStock === false}>
                  {Number(s.kg)} kg{s.inStock === false ? " (sold out)" : ""}
                </option>
              ))}
            </select>
            <strong>{selected.price != null ? formatRupees(selected.price * (inCart ? inCart.qty : qty)) : "—"}</strong>
          </label>
          <button
            type="button"
            className={`btn-outline pdp-buybar-add${inCart ? " is-added" : ""}`}
            onClick={inCart ? () => navigate("/cart") : handleAddToCart}
            disabled={soldOut}
            tabIndex={ctaInView ? -1 : 0}
          >
            {soldOut ? "Sold out" : inCart ? "Added ✓" : "Add to cart"}
          </button>
          <button type="button" className="btn-maroon pdp-buybar-buy pdp-buy-btn" onClick={handleBuyNow} disabled={soldOut} tabIndex={ctaInView ? -1 : 0}>
            Buy now
          </button>
          {/* Order on WhatsApp, the message naming this pack (Google Ads "WhatsApp lead", button_location sticky_bar). */}
          <a
            className="pdp-buybar-wa"
            href={whatsappOrderLink(`Hi Chennai Rice, I would like to order ${productName(product.id) || product.name} (${Number(selected.kg)} kg).`)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Order on WhatsApp"
            data-track-location="sticky_bar"
            tabIndex={ctaInView ? -1 : 0}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z" />
            </svg>
          </a>
        </div>
      )}
    </SiteLayout>
  );
}
