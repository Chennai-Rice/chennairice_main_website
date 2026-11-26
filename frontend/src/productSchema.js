// Product structured data shared by the live product page (shop/pages/ProductDetailPage.jsx) and the pre-rendered
// HTML (scripts/prerender-content.mjs), so the two always agree (SEO audit error 7, 26 Nov 2026):
//   - one Offer per pack, with its price, stock, the delivery charge per delivery region and the return policy;
//   - star ratings and reviews only from genuine published customer reviews (GET /api/reviews), and only on the
//     product page that shows those same reviews.
const SITE = 'https://chennairiceindustries.com'

// Delivery regions by PIN code, as the checkout charges them (backend/lib/sales/regions.js regionForPincode).
const REGION_PREFIXES = {
  TN: ['60', '61', '62', '63', '64'],
  SOUTH: ['50', '51', '52', '53', '56', '57', '58', '59', '67', '68', '69'],
  NE: ['737', '78', '79'],
  NORTH: ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
    '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49',
    '54', '55', '65', '66', '70', '71', '72', '73', '74', '75', '76', '77', '80', '81', '82', '83', '84', '85'],
}

// Return & Refund Policy (/refund): damaged, wrong, short-weight or quality problems reported within 7 days of
// delivery (48 hours for transit damage) get a free replacement or a full refund, usually without sending rice back.
const RETURN_POLICY = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'IN',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 7,
  returnFees: 'https://schema.org/FreeReturn',
  refundType: 'https://schema.org/FullRefund',
  merchantReturnLink: SITE + '/refund',
}

const shipping = (delivery) => Object.entries(REGION_PREFIXES)
  .filter(([code]) => typeof delivery?.[code] === 'number')
  .map(([code, prefixes]) => ({
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: Math.round(delivery[code] * 100) / 100, currency: 'INR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN', postalCodePrefix: prefixes },
  }))

/** One Offer per priced pack: packs = [{ kg, price, inStock, delivery, sku }]. */
export function packOffers(packs, url) {
  return (packs || []).filter((p) => typeof p.price === 'number' && p.price > 0).map((p) => {
    const ship = shipping(p.delivery)
    return {
      '@type': 'Offer',
      name: `${p.kg} kg pack`,
      ...(p.sku ? { sku: p.sku } : {}),
      price: p.price,
      priceCurrency: 'INR',
      availability: p.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      url,
      seller: { '@id': SITE + '/#organization' },
      ...(ship.length ? { shippingDetails: ship } : {}),
      hasMerchantReturnPolicy: RETURN_POLICY,
    }
  })
}

// "Kitchidi Ponni Rice" and "Kitchadi Ponni Rice" (the old spelling on early orders) are one product.
const norm = (s) => String(s || '').toLowerCase().replace(/kitchadi/g, 'kitchidi').replace(/[^a-z]/g, '')

/** The published reviews of one product: orders of that product alone (a mixed order's review is not about one rice). */
export function productReviews(reviews, ...names) {
  const want = new Set(names.filter(Boolean).map(norm))
  return (reviews || []).filter((r) => {
    const items = String(r.products || '').split(',').map((x) => x.trim()).filter(Boolean)
    return items.length === 1 && want.has(norm(items[0])) && r.rating >= 1 && r.rating <= 5
  })
}

/** The average of a product's reviews, rounded to one decimal. */
export const averageRating = (list) => (list.length ? Math.round((list.reduce((t, r) => t + r.rating, 0) / list.length) * 10) / 10 : null)

/** aggregateRating and review for a product's own published reviews; nothing when it has none. */
export function reviewSchema(list) {
  if (!list?.length) return {}
  const written = list.filter((r) => String(r.text || '').trim())
  return {
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: averageRating(list),
      bestRating: 5,
      worstRating: 1,
      ratingCount: list.length,
      ...(written.length ? { reviewCount: written.length } : {}),
    },
    ...(written.length ? {
      review: written.slice(0, 10).map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.name || 'Customer' },
        ...(r.date ? { datePublished: String(r.date).slice(0, 10) } : {}),
        reviewBody: String(r.text).trim(),
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      })),
    } : {}),
  }
}
