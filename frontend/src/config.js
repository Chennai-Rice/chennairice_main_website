// Site-wide feature switches, read from Vite's build-time env.
//
// These exist so a feature can be finished, tested and merged while still being
// hidden from the public site — the code stays in place and nothing has to be
// deleted and rewritten later to turn it back on.

/**
 * Whether online checkout and payment are open to the public.
 *
 * Off unless VITE_CHECKOUT_ENABLED is exactly "true". Defaulting to OFF is the
 * safety property that matters here: a deploy that forgets to set this shows
 * "coming soon" rather than taking real money through a flow nobody meant to
 * expose. A typo ("yes", "1", "TRUE") also lands on off for the same reason.
 *
 * With it off, /checkout renders the Coming Soon page (see App.jsx) and the
 * cart says so instead of promising a payment step. The whole checkout and
 * payment stack — the page, the gateways, the receipt — stays exactly where it
 * is; nothing is removed. Set this to "true" to switch it all back on.
 */
export const isCheckoutEnabled = import.meta.env.VITE_CHECKOUT_ENABLED === 'true'

/**
 * Whether the storefront shows prices at all.
 *
 * Off unless VITE_SHOW_PRICES is exactly "true". With it off, product cards and
 * product detail pages show "Price on request" and a route to the sales team
 * instead of a figure and an add-to-cart control.
 *
 * This has to cover the detail page as well as the cards, not as a matter of
 * taste: the current catalogue was built from pack artwork that carries no
 * pricing, so every variant sits at 0. A card that says "Price on request"
 * leading to a page that says "₹0" would be worse than either alone.
 *
 * Turn this on only once real prices are in `product_variants`.
 */
export const showCardPrices = import.meta.env.VITE_SHOW_PRICES === 'true'

/**
 * Whether the "Brand Ambassadors" section appears on the homepage.
 *
 * Off unless VITE_SHOW_AMBASSADORS is exactly "true". Hidden the same way
 * checkout is: the section, its data and its images all stay in the repo, so
 * turning it back on is one variable rather than a rebuild of the component.
 */
export const showAmbassadors = import.meta.env.VITE_SHOW_AMBASSADORS === 'true'
