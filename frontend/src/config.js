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
