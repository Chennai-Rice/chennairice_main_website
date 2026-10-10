// Delivery partners and their own tracking pages (checked 2026-10-10).
//
// deepLink: a URL that opens the partner's page with the AWB already filled
// in, or null where the partner only takes the number through a form or a
// captcha — then the customer gets the tracking page and copies the AWB in.
// domains: the only hosts a link from the courier's sheet is trusted on;
// any other link is replaced by the partner's own page.

export const COURIERS = [
  {
    key: 'bluedart', name: 'Blue Dart',
    aliases: ['Blue Dart', 'BlueDart', 'Blue Dart Express', 'BD', 'BDE', 'DHL Blue Dart'],
    domains: ['bluedart.com'],
    trackingPage: 'https://www.bluedart.com/web/guest/domestic',
    deepLink: 'https://www.bluedart.com/web/guest/trackdartresultthirdparty?trackFor=0&trackNo={awb}',
  },
  {
    key: 'dtdc', name: 'DTDC',
    aliases: ['DTDC', 'DTDC Express', 'DTDC Courier', 'D.T.D.C'],
    domains: ['dtdc.com', 'dtdc.in'],
    trackingPage: 'https://www.dtdc.com/track-your-shipment/',
    deepLink: 'https://www.dtdc.com/track-your-shipment/?awb={awb}',
  },
  {
    key: 'trackon', name: 'Trackon Couriers',
    aliases: ['Trackon', 'Trackon Courier', 'Trackon Couriers', 'Trackon Couriers Pvt Ltd'],
    domains: ['trackon.in'],
    trackingPage: 'https://www.trackon.in/courier-tracking',
    deepLink: null, // ?awb= is advertised but the page does not use it
  },
  {
    key: 'delhivery', name: 'Delhivery',
    aliases: ['Delhivery', 'Delhivery Express', 'DLV', 'Delhivery Ltd'],
    domains: ['delhivery.com'],
    trackingPage: 'https://www.delhivery.com/tracking',
    deepLink: 'https://www.delhivery.com/track-v2/package/{awb}',
  },
  {
    // Merged into Delhivery; ecomexpress.in no longer tracks (and its certificate has lapsed).
    key: 'ecomexpress', name: 'Ecom Express',
    aliases: ['Ecom Express', 'EcomExpress', 'Ecom'],
    domains: ['delhivery.com'],
    alsoKnownHosts: ['ecomexpress.in'],
    trackingPage: 'https://www.delhivery.com/tracking',
    deepLink: 'https://www.delhivery.com/track-v2/package/{awb}',
  },
  {
    key: 'tpc', name: 'The Professional Couriers',
    aliases: ['Professional Couriers', 'Professional Courier', 'TPC', 'The Professional Couriers', 'Professional'],
    domains: ['tpcindia.com', 'tpcglobe.com'],
    trackingPage: 'https://www.tpcindia.com/',
    deepLink: null,
  },
  {
    key: 'stcourier', name: 'ST Courier',
    aliases: ['ST Courier', 'ST Couriers', 'S.T. Courier', 'STC', 'ST Courier Pvt Ltd'],
    domains: ['stcourier.com'],
    trackingPage: 'https://stcourier.com/track/shipment',
    deepLink: null,
  },
  {
    key: 'indiapost', name: 'India Post',
    aliases: ['India Post', 'Speed Post', 'SpeedPost', 'Indian Post', 'Registered Post', 'RPAD', 'India Post Speed Post'],
    domains: ['indiapost.gov.in'],
    trackingPage: 'https://www.indiapost.gov.in/',
    deepLink: null,
  },
  {
    key: 'xpressbees', name: 'XpressBees',
    aliases: ['XpressBees', 'Xpress Bees', 'Express Bees', 'XB', 'Xbees'],
    domains: ['xpressbees.com', 'xbees.in'],
    trackingPage: 'https://www.xpressbees.com/shipment/tracking',
    deepLink: 'https://www.xpressbees.com/shipment/tracking?awbNo={awb}',
  },
  {
    key: 'ekart', name: 'Ekart Logistics',
    aliases: ['Ekart', 'E-kart', 'Ekart Logistics', 'Flipkart Ekart', 'EKL'],
    domains: ['ekartlogistics.com'],
    trackingPage: 'https://ekartlogistics.com/',
    deepLink: 'https://ekartlogistics.com/ekartlogistics-web/shipmenttrack/{awb}',
  },
  {
    key: 'shadowfax', name: 'Shadowfax',
    aliases: ['Shadowfax', 'Shadow Fax', 'SFX'],
    domains: ['shadowfax.in'],
    trackingPage: 'https://www.shadowfax.in/track',
    deepLink: null,
  },
  {
    key: 'shreemaruti', name: 'Shree Maruti Courier',
    aliases: ['Shree Maruti', 'Shri Maruti', 'Shree Maruti Courier', 'Maruti Courier', 'SMC'],
    domains: ['shreemaruti.com'],
    trackingPage: 'https://shreemaruti.com/track-shipment/',
    deepLink: 'https://shreemaruti.com/track-shipment/?awb={awb}',
  },
  {
    key: 'gati', name: 'Gati',
    aliases: ['Gati', 'Gati KWE', 'Allcargo Gati', 'Gati Express'],
    domains: ['allcargologistics.com', 'gati.com'],
    trackingPage: 'https://www.allcargologistics.com/track-shipment',
    deepLink: null,
  },
  {
    key: 'franchexpress', name: 'Franch Express',
    aliases: ['Franch Express', 'Franch', 'French Express', 'Franch Courier'],
    domains: ['franchexpress.com'],
    trackingPage: 'https://franchexpress.com/courier-tracking/',
    deepLink: null,
  },
  {
    // Its number lookup (anjanicourier.in) works over plain http only, so it is not used.
    key: 'shreeanjani', name: 'Shree Anjani Courier',
    aliases: ['Shree Anjani', 'Shri Anjani', 'Anjani Courier', 'Shree Anjani Courier', 'Shree Anjani Courier Services'],
    domains: ['shreeanjanicourier.com'],
    alsoKnownHosts: ['anjanicourier.in'],
    trackingPage: 'https://www.shreeanjanicourier.com/',
    deepLink: null,
  },
  {
    key: 'madhur', name: 'Madhur Couriers',
    aliases: ['Madhur', 'Madhur Courier', 'Madhur Couriers', 'Madhur Courier Services'],
    domains: ['madhurcouriers.in'],
    trackingPage: 'https://www.madhurcouriers.in/CNoteTracking.aspx',
    deepLink: null,
  },
]

// "Blue-Dart Express Pvt. Ltd." → "bluedartexpress"; a second, looser key
// also drops the generic words, so "DTDC Couriers Ltd" still finds DTDC.
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const GENERIC = /\b(pvt|private|ltd|limited|co|company|india|services?|couriers?|express|logistics|cargo|the)\b/g
const loose = (s) => squash(String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(GENERIC, ' '))

const EXACT = new Map()
const LOOSE = new Map()
for (const c of COURIERS) {
  for (const a of [c.name, c.key, ...c.aliases]) {
    if (!EXACT.has(squash(a))) EXACT.set(squash(a), c)
    const l = loose(a)
    if (l && !LOOSE.has(l)) LOOSE.set(l, c)
  }
}

/** The courier a partner name in the sheet means, or null. */
export function findCourier(name) {
  const s = squash(name)
  if (!s) return null
  return EXACT.get(s) || LOOSE.get(loose(name)) || null
}

const cleanHost = (host) => String(host || '').toLowerCase().replace(/\.$/, '')
const onDomain = (host, d) => host === d || host.endsWith('.' + d)

/** Whether a link on this host may be used for this courier. */
export function isCourierHost(courier, host) {
  const h = cleanHost(host)
  return Boolean(courier && h && courier.domains.some((d) => onDomain(h, d)))
}

/** The courier a tracking link points at, by its website. */
export function courierForHost(host) {
  const h = cleanHost(host)
  if (!h) return null
  return COURIERS.find((c) => [...c.domains, ...(c.alsoKnownHosts || [])].some((d) => onDomain(h, d))) || null
}

// Every partner opens its own fixed tracking page and the customer pastes the
// AWB there (owner's choice, 2026-10-10). Set true to pre-fill the AWB through
// deepLink where a partner allows it.
export const USE_DEEP_LINKS = false

/** The partner's tracking page for this AWB. */
export function buildTrackingUrl(courier, awb) {
  if (!courier) return null
  return USE_DEEP_LINKS && courier.deepLink && awb
    ? courier.deepLink.replace('{awb}', encodeURIComponent(awb))
    : courier.trackingPage
}

const AWB_PARAMS = ['awb', 'awbno', 'awbnumber', 'trackno', 'trackingno', 'trackingnumber', 'trackingid', 'tracking',
  'cn', 'cno', 'cnno', 'consignment', 'consignmentno', 'docket', 'docketno', 'no', 'id', 'number', 'ref']
const looksLikeAwb = (s) => /^[A-Za-z0-9-]{6,40}$/.test(s) && /\d/.test(s)

/** The AWB / tracking number inside a tracking link, if one is there. */
export function awbFromUrl(url) {
  let u = url
  try {
    if (!(u instanceof URL)) u = new URL(String(url))
  } catch {
    return ''
  }
  for (const [k, v] of u.searchParams) {
    if (AWB_PARAMS.includes(k.toLowerCase()) && looksLikeAwb(v.trim())) return v.trim()
  }
  const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
  return looksLikeAwb(last) ? last : ''
}
