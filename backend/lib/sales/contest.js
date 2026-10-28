// Super Slogan Contest (coupon.chennairiceindustries.com): the entries and
// coupons live in Firestore in the Firebase project "couponchennairice".
// This reads them, never writes: the website's service account has only
// Cloud Datastore Viewer there. Demo / test entries (isDemo) are left out.
//
// Used by Analyst → Contest, the Business Advisor's contest tool and the
// coupon entries report.
import { query } from '../db.js'
import { str } from './util.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const PROJECT = process.env.CONTEST_PROJECT_ID || 'couponchennairice'
const istDay = (t = Date.now()) => new Date(t + 330 * 60000).toISOString().slice(0, 10)
const mobile = (v) => str(v).replace(/\D/g, '').slice(-10)

// ---------------------------------------------------------------- the source

let db = null
async function firestore() {
  if (!db) {
    const { initializeApp, getApps } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    const app = getApps().find((a) => a.name === 'contest') || initializeApp({ projectId: PROJECT }, 'contest')
    db = getFirestore(app)
  }
  return db
}

const firestoreSource = {
  /** Entries submitted between two instants, as plain objects. */
  async entries(start, end) {
    const snap = await (await firestore()).collection('entries')
      .where('submittedAt', '>=', start).where('submittedAt', '<=', end).get()
    return snap.docs.map((d) => {
      const e = d.data()
      return { ...e, id: d.id, submittedAt: e.submittedAt?.toDate ? e.submittedAt.toDate() : new Date(e.submittedAt) }
    })
  },
  /** Coupons printed and used, all time (count queries, not a read of 2 lakh documents). */
  async coupons() {
    const c = (await firestore()).collection('coupons')
    const [all, used, demo] = await Promise.all([
      c.count().get(), c.where('used', '==', true).count().get(), c.where('isDemo', '==', true).count().get(),
    ])
    return { printed: all.data().count - demo.data().count, used: used.data().count }
  },
}

let source = firestoreSource
let couponCache = null
/** Tests: a stand-in for Firestore ({ entries(start, end), coupons() }); null restores it. */
export function setContestSourceForTests(s) {
  source = s || firestoreSource
  couponCache = null
}

async function couponCounts() {
  if (couponCache && Date.now() - couponCache.at < 10 * 60000) return couponCache.value
  const value = await source.coupons()
  couponCache = { at: Date.now(), value }
  return value
}

// ---------------------------------------------------------------- the report

function period(q = {}) {
  const today = istDay()
  const to = DAY.test(str(q.to)) ? str(q.to) : today
  const from = DAY.test(str(q.from)) ? str(q.from) : to.slice(0, 8) + '01'
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1)
  return { from, to, days }
}
const startOf = (day) => new Date(`${day}T00:00:00+05:30`)
const endOf = (day) => new Date(`${day}T23:59:59.999+05:30`)
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)

const PACK = (v) => {
  const s = str(v).replace(/\s+/g, '').toLowerCase()
  return s ? s.replace(/kg$/, ' kg') : 'Not given'
}
const SOURCE = { website: 'Website', whatsapp: 'WhatsApp' }

function tally(rows, key, limit) {
  const m = new Map()
  for (const r of rows) {
    const k = key(r)
    if (k) m.set(k, (m.get(k) || 0) + 1)
  }
  const out = [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  return limit ? out.slice(0, limit) : out
}

/** Real (not demo) entries of a period, oldest first, in the shape the page and the CSV use. */
export async function contestEntries(q = {}) {
  const p = period(q)
  const raw = await source.entries(startOf(p.from), endOf(p.to))
  const entries = raw.filter((e) => e.isDemo !== true).map((e) => ({
    at: e.submittedAt instanceof Date ? e.submittedAt.toISOString() : null,
    name: str(e.fullName) || null,
    phone: str(e.phone || e.waPhone) || null,
    mobile: mobile(e.phone || e.waPhone),
    email: str(e.email) || null,
    coupon: str(e.couponCode) || null,
    slogan: str(e.slogan) || null,
    pack: PACK(e.packSize),
    shop: str(e.shopName) || null,
    shopLocation: str(e.shopLocation) || null,
    area: str(e.area) || null,
    district: str(e.district) || null,
    region: str(e.region) || null,
    pincode: str(e.pincode) || null,
    source: str(e.source) || 'website',
    consent: e.marketingConsent === true,
  })).sort((a, b) => String(a.at).localeCompare(String(b.at)))
  return { period: p, entries }
}

/** The Contest section: totals, per day, by pack / region / district / shop / source, and who also bought online. */
export async function contestReport(q = {}, { list = true } = {}) {
  const { period: p, entries } = await contestEntries(q)
  const prevFrom = addDays(p.from, -p.days)
  const [previous, coupons] = await Promise.all([
    contestEntries({ from: prevFrom, to: addDays(p.from, -1) }).then((r) => r.entries.length),
    couponCounts(),
  ])

  // Entrants whose mobile also has a paid website order (any time), and whether that came after the entry.
  const mobiles = [...new Set(entries.map((e) => e.mobile).filter((m) => m.length === 10))]
  const bought = new Map()
  if (mobiles.length) {
    const { rows } = await query(
      `select right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) as mobile, count(*)::int as orders,
              coalesce(sum(total_paise), 0)::bigint as paise, min(placed_at) as first_at
         from orders
        where placed_at is not null and payment_status in ('paid', 'partially_refunded') and status not in ('cancelled', 'returned')
          and right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = any($1::text[])
        group by 1`, [mobiles])
    for (const r of rows) bought.set(r.mobile, r)
  }
  const buyers = mobiles.filter((m) => bought.has(m))
  const firstEntry = new Map()
  for (const e of entries) if (!firstEntry.has(e.mobile)) firstEntry.set(e.mobile, e.at)
  const afterEntry = buyers.filter((m) => bought.get(m).first_at && new Date(bought.get(m).first_at) >= new Date(firstEntry.get(m)))

  const perDay = []
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) perDay.push({ day: d, entries: 0, website: 0, whatsapp: 0 })
  const byDay = new Map(perDay.map((d) => [d.day, d]))
  for (const e of entries) {
    const d = byDay.get(istDay(Date.parse(e.at)))
    if (d) { d.entries++; if (e.source === 'whatsapp') d.whatsapp++; else d.website++ }
  }

  const shops = new Map()
  for (const e of entries) {
    if (!e.shop) continue
    // Shop names are typed by entrants: "Family super market" and "Family supermarket" are one shop.
    const key = `${e.shop.toLowerCase().replace(/[^a-z0-9]/g, '')}|${(e.area || e.district || '').toLowerCase()}`
    const s = shops.get(key) || { shop: e.shop, place: [e.area, e.district].filter(Boolean).join(', ') || null, entries: 0 }
    s.entries++
    shops.set(key, s)
  }

  const n = entries.length
  const report = {
    period: p,
    totals: {
      entries: n,
      people: new Set(entries.map((e) => e.mobile || e.coupon)).size,
      website: entries.filter((e) => e.source !== 'whatsapp').length,
      whatsapp: entries.filter((e) => e.source === 'whatsapp').length,
      consent: entries.filter((e) => e.consent).length,
      consentPercent: n ? Math.round((entries.filter((e) => e.consent).length / n) * 100) : null,
      perDay: Math.round((n / p.days) * 10) / 10,
      changePercent: previous ? Math.round(((n - previous) / previous) * 100) : null,
      previousEntries: previous,
    },
    // All time: every coupon printed so far, and how many have been entered.
    coupons: { ...coupons, usedPercent: coupons.printed ? Math.round((coupons.used / coupons.printed) * 10000) / 100 : null },
    buyers: {
      entrants: mobiles.length,
      boughtOnline: buyers.length,
      percent: mobiles.length ? Math.round((buyers.length / mobiles.length) * 1000) / 10 : null,
      firstOrderAfterEntry: afterEntry.length,
      orders: buyers.reduce((a, m) => a + bought.get(m).orders, 0),
      revenue: buyers.reduce((a, m) => a + Number(bought.get(m).paise), 0) / 100,
    },
    perDay,
    bySource: tally(entries, (e) => SOURCE[e.source] || e.source),
    byPack: tally(entries, (e) => e.pack),
    byRegion: tally(entries, (e) => e.region || 'Not given'),
    byDistrict: tally(entries, (e) => e.district, 15),
    topShops: [...shops.values()].sort((a, b) => b.entries - a.entries || a.shop.localeCompare(b.shop)).slice(0, 15),
  }
  if (list) report.list = entries.slice().reverse().map(({ mobile: m, ...e }) => ({ ...e, boughtOnline: bought.has(m) }))
  return report
}
