import { useEffect, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { dayLabel } from './shared.jsx'

// Sales by where the buyer came from: Meta ads (Facebook / Instagram), Google
// Ads, unpaid social and search, WhatsApp, other sites and direct visits —
// down to each campaign and ad, with visits → checkouts → orders → revenue.

const rupees = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

// The period: a quick choice, or any From–To dates (India time, both days included; one day = same date twice).
const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
const daysBack = (n) => new Date(Date.parse(istToday() + 'T00:00:00Z') - (n - 1) * 86400000).toISOString().slice(0, 10)
const PERIODS = [
  { key: 'today', label: 'Today', range: () => ({ from: istToday(), to: istToday() }) },
  { key: '7', label: 'Last 7 days', range: () => ({ from: daysBack(7), to: istToday() }) },
  { key: '30', label: 'Last 30 days', range: () => ({ from: daysBack(30), to: istToday() }) },
  { key: '90', label: 'Last 90 days', range: () => ({ from: daysBack(90), to: istToday() }) },
  { key: 'all', label: 'All time', range: () => ({ from: '2024-01-01', to: istToday() }) },
  { key: 'custom', label: 'Choose dates…' },
]
const rangeQuery = (r) => `from=${r.from}&to=${r.to}`
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')

const META_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'
const GOOGLE_SUFFIX = 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}'

const TONE = {
  meta_ads_facebook: '#1877f2', meta_ads_instagram: '#d6249f', meta_ads: '#5b6cf0', google_ads: '#34a853',
  facebook: '#7aa7f5', instagram: '#f08ac8', google_search: '#8bc79a', whatsapp: '#25d366', whatsapp_chat: '#128c7e', expo: '#c08a2d', other_website: '#b49a6a', direct: '#8a7766',
}

// The channel filter: each button stands for these source keys.
const CHANNELS = [
  { key: '', label: 'All' },
  { key: 'meta', label: 'Meta ads', sources: ['meta_ads_instagram', 'meta_ads_facebook', 'meta_ads'] },
  { key: 'google', label: 'Google', sources: ['google_ads', 'google_search'] },
  { key: 'whatsapp', label: 'WhatsApp', sources: ['whatsapp', 'whatsapp_chat'] },
  { key: 'social', label: 'Instagram / Facebook (not ads)', sources: ['instagram', 'facebook'] },
  { key: 'direct', label: 'Direct', sources: ['direct'] },
  { key: 'other', label: 'Other (websites, Expo QR)', sources: ['other_website', 'expo'] },
]
const inChannel = (channel, source) => !channel || (CHANNELS.find((c) => c.key === channel)?.sources || []).includes(source)
// A Meta campaign ID (e.g. 120251768166180156) means the visit came from a Meta ad, even
// when the ad's link said "facebook" / "instagram" without utm_medium=paid.
const META_ID = /^\d{12,}$/
// Names for the Meta campaign, ad set and ad IDs that ad links carry ({{campaign.id}}, {{ad.id}}), from Meta
// Ads Manager (account 1204684567608575, 4 Nov 2026). Ads tagged with names ({{campaign.name}}) need no entry.
const AD_NAMES = {
  // Campaigns
  '120252047257960156': { campaign: "CR_KitchidiPonni_Website_Sales" },
  '120252076739410156': { campaign: "CR_Kitchidi_Ponni_Traffic" },
  '120252082470920156': { campaign: "CR_Kitchidi_Ponni_Traffic 1" },
  '120251768166170156': { campaign: "Sales - Kichadi Ponni Rice" },
  '120251724928590156': { campaign: "OVERVIEW CREATIVE 14/10" },
  '120251713475410156': { campaign: "SLOGAN READY TRAFFIC - 13/10" },
  '120251712405340156': { campaign: "COUPON VANTHACHI - 13-10-26 | Awareness" },
  '120251725750570156': { campaign: "Post: Chennai Rice Amma taste (boosted)" },
  // Ad sets
  '120252047257940156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image - chennai" },
  '120252076599020156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Erode" },
  '120252076598980156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Coimbatore" },
  '120252076599000156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Madurai" },
  '120252076739400156': { campaign: "CR_Kitchidi_Ponni_Traffic", adSet: "Prabhu Dialogue" },
  '120252082470930156': { campaign: "CR_Kitchidi_Ponni_Traffic 1", adSet: "Jingle 10 to 40 sec" },
  '120251768166190156': { campaign: "Sales - Kichadi Ponni Rice", adSet: "New Sales ad set" },
  '120251724928580156': { campaign: "OVERVIEW CREATIVE 14/10", adSet: "ad set 02" },
  '120251713475390156': { campaign: "SLOGAN READY TRAFFIC - 13/10", adSet: "AD SET 01" },
  '120251712405320156': { campaign: "COUPON VANTHACHI - 13-10-26 | Awareness", adSet: "ad set 1" },
  // Ads
  '120252047257950156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image - chennai", ad: "parisu vettai - poster" },
  '120252075114730156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image - chennai", ad: "jingle 20 sec" },
  '120252076599010156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Erode", ad: "jingle 20 sec" },
  '120252076599030156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Erode", ad: "parisu vettai - poster" },
  '120252076598990156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Coimbatore", ad: "parisu vettai - poster" },
  '120252076599040156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Coimbatore", ad: "jingle 20 sec" },
  '120252076599050156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Madurai", ad: "jingle 20 sec" },
  '120252076598840156': { campaign: "CR_KitchidiPonni_Website_Sales", adSet: "prabhu image – Madurai", ad: "parisu vettai - poster" },
  '120252079355870156': { campaign: "CR_Kitchidi_Ponni_Traffic", adSet: "Prabhu Dialogue", ad: "dialogue - 20 sec" },
  '120252076739420156': { campaign: "CR_Kitchidi_Ponni_Traffic", adSet: "Prabhu Dialogue", ad: "dialogue - 10 sec" },
  '120252079355860156': { campaign: "CR_Kitchidi_Ponni_Traffic", adSet: "Prabhu Dialogue", ad: "dialogue - 30 sec" },
  '120252083685750156': { campaign: "CR_Kitchidi_Ponni_Traffic 1", adSet: "Jingle 10 to 40 sec", ad: "JINGLE 30 SEC" },
  '120252082470940156': { campaign: "CR_Kitchidi_Ponni_Traffic 1", adSet: "Jingle 10 to 40 sec", ad: "JINGLE 40 SEC" },
  '120252084014500156': { campaign: "CR_Kitchidi_Ponni_Traffic 1", adSet: "Jingle 10 to 40 sec", ad: "JINGLE 15 SEC" },
  '120251768166180156': { campaign: "Sales - Kichadi Ponni Rice", adSet: "New Sales ad set", ad: "New Sales ad" },
  '120251724928570156': { campaign: "OVERVIEW CREATIVE 14/10", adSet: "ad set 02", ad: "slogan contest" },
  '120251713475400156': { campaign: "SLOGAN READY TRAFFIC - 13/10", adSet: "AD SET 01", ad: "Single image" },
  '120251712405330156': { campaign: "COUPON VANTHACHI - 13-10-26 | Awareness", adSet: "ad set 1", ad: "Creative" },
  '120251725752490156': { campaign: "Post: Chennai Rice Amma taste (boosted)", ad: "Post: \"Chennai Rice Amma taste…\"" },
}
const isMetaId = (v) => META_ID.test(v || '') || Boolean(AD_NAMES[v])
const isUntaggedMetaAd = (r) => ['facebook', 'instagram'].includes(r.source) && (isMetaId(r.campaign) || isMetaId(r.ad))
// Links whose placeholders were never filled in (<campaign-name>, {{campaign.id}}…).
const isTestLink = (r) => /\{\{|<(campaign|ad)[-_ ]?(name|id)>/i.test(`${r.campaign}${r.ad}`)
/** The channel a campaign row belongs to. */
const channelOf = (r) => (isTestLink(r) ? 'test' : isUntaggedMetaAd(r) ? 'meta' : CHANNELS.find((c) => c.sources?.includes(r.source))?.key || 'other')
const pretty = (v) => String(v || '').replace(/[<>]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
const shortId = (v) => `…${String(v).slice(-4)}`
// Rows are rebuilt on every render, so an open row is matched by what it is, not by object.
const rowKey = (r) => `${r.source}|${r.campaign || ''}|${r.ad || ''}`
/** The campaign a row belongs to, by name where we know it. */
function campaignName(r) {
  const known = AD_NAMES[r.campaign]?.campaign || AD_NAMES[r.ad]?.campaign
  if (known) return known
  if (META_ID.test(r.campaign || '')) return `Meta campaign ${shortId(r.campaign)}`
  if (r.campaign) return pretty(r.campaign)
  return r.ad && r.source !== 'direct' ? `${r.label} · ${pretty(r.ad)}` : r.label
}
/** What a row adds under its campaign: where it ran and which ad / placement. */
function rowDetail(r) {
  const known = AD_NAMES[r.ad] || {}
  const ad = known.ad || (META_ID.test(r.ad || '') ? `ad ${shortId(r.ad)}` : pretty(r.ad))
  const viaAd = !AD_NAMES[r.ad] && AD_NAMES[r.campaign]?.ad ? AD_NAMES[r.campaign].ad : ''
  // Ad set (city / audience) before the ad, when the ad is a known Meta ad.
  return [r.label.replace(' (not an ad)', ''), known.adSet, viaAd, ad].filter(Boolean).join(' · ')
}
const GROUP_LABEL = { test: 'Test or broken links (not real ads)' }

function CopyLine({ label, text }) {
  const [done, setDone] = useState(false)
  return (
    <div className="wh-src-copy">
      <span className="wh-muted wh-small">{label}</span>
      <code>{text}</code>
      <button type="button" className="wh-btn wh-btn--outline" onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })
      }}>{done ? 'Copied ✓' : 'Copy'}</button>
    </div>
  )
}

export default function SourcesReport({ say, onAuthError }) {
  const [period, setPeriod] = useState('30')
  const [custom, setCustom] = useState(() => ({ from: daysBack(30), to: istToday() }))
  const range = period === 'custom' ? custom : PERIODS.find((p) => p.key === period).range()
  const rq = rangeQuery(range)
  const [product, setProduct] = useState('')
  const [products, setProducts] = useState([])
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null) // { key, orders }
  const [help, setHelp] = useState(false)
  const [channel, setChannel] = useState('')
  const [find, setFind] = useState('')
  const [shut, setShut] = useState({}) // channel key -> collapsed

  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {})
  }, [])

  useEffect(() => {
    let live = true
    setData(null)
    setOpen(null)
    staffJson(`/api/admin/warehouse/sources?${rq}&product=${encodeURIComponent(product)}`)
      .then((d) => live && setData(d))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [rq, product, say, onAuthError])

  async function showOrders(row) {
    if (open && open.key === rowKey(row)) return setOpen(null)
    try {
      const q = new URLSearchParams({ ...range, product, source: row.source, campaign: row.campaign || '', ad: row.ad || '' })
      const d = await staffJson(`/api/admin/warehouse/sources/orders?${q}`)
      setOpen({ key: rowKey(row), orders: d.orders })
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  // Rows filtered by channel and search, then rolled up: channel → campaign (by name) → the ad / placement rows.
  const needle = find.trim().toLowerCase()
  const all = (data?.campaigns || []).map((r) => ({ ...r, channel: channelOf(r), name: campaignName(r), detail: rowDetail(r) }))
  const rows = all.filter((r) => (!channel || r.channel === channel)
    && (!needle || `${r.name} ${r.detail} ${r.campaign} ${r.ad}`.toLowerCase().includes(needle)))
  const add = (t, r) => ({ visits: t.visits + (r.visits || 0), checkouts: t.checkouts + r.checkouts, orders: t.orders + r.orders, revenue: t.revenue + r.revenue })
  const zero = { visits: 0, checkouts: 0, orders: 0, revenue: 0 }
  const byRevenue = (a, b) => b.revenue - a.revenue || b.orders - a.orders || b.visits - a.visits
  const groups = [...CHANNELS.filter((c) => c.key), { key: 'test', label: GROUP_LABEL.test }].map((c) => {
    const mine = rows.filter((r) => r.channel === c.key)
    const camps = new Map()
    for (const r of mine) {
      const k = r.name.toLowerCase()
      const x = camps.get(k) || { name: r.name, rows: [], ...zero }
      camps.set(k, { ...x, ...add(x, r), rows: [...x.rows, r] })
    }
    const list = [...camps.values()].map((x) => ({ ...x, rows: x.rows.sort(byRevenue) })).sort(byRevenue)
    return { ...c, list, ...mine.reduce(add, zero) }
  }).filter((g) => g.list.length)
  // The channel cards: every channel's totals (search and channel filter aside).
  const channelCards = CHANNELS.filter((c) => c.key).map((c) => ({ ...c, ...all.filter((r) => r.channel === c.key).reduce(add, zero) }))
    .filter((c) => c.visits || c.orders)
  const totalRevenue = channelCards.reduce((t, c) => t + c.revenue, 0)

  return (
    <>
    <section className="wh-panel wh-src">
      <header className="wh-src-head">
        <div>
          <h2 className="wh-panel-title">Where orders come from</h2>
          <p className="wh-muted wh-small">Meta ads (Facebook / Instagram), Google Ads, other visits and direct — by campaign and ad.</p>
        </div>
        <div className="wh-src-filters">
          <label className="wh-filter"><span>Period</span>
            <span className="wh-select"><select value={period} onChange={(e) => {
              const key = e.target.value
              if (key === 'custom' && period !== 'custom') setCustom(range)
              setPeriod(key)
            }}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select></span>
          </label>
          {period === 'custom' && (
            <>
              <label className="wh-filter"><span>From</span>
                <input className="wh-input" type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
              <label className="wh-filter"><span>To</span>
                <input className="wh-input" type="date" value={custom.to} min={custom.from} max={istToday()} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
            </>
          )}
          <label className="wh-filter"><span>Product</span>
            <span className="wh-select"><select value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select></span>
          </label>
          <button type="button" className="wh-link-btn wh-small" onClick={() => setHelp((v) => !v)}>How to tag your ads</button>
        </div>
      </header>

      {help && (
        <div className="wh-src-help">
          <p><strong>Meta (Facebook &amp; Instagram) ads:</strong> in Ads Manager → the ad → <em>Tracking</em> → <em>URL parameters</em>, paste:</p>
          <CopyLine label="URL parameters" text={META_PARAMS} />
          <p><strong>Google Ads:</strong> keep <em>Auto-tagging</em> on (Admin → Account settings), and in the campaign → Settings → <em>Campaign URL options</em> → <em>Final URL suffix</em>, paste:</p>
          <CopyLine label="Final URL suffix" text={GOOGLE_SUFFIX} />
          <p className="wh-muted wh-small">Visits are counted from tagged links and other sites. An order is credited to the last ad or site the buyer came from in the 30 days before ordering; with none, it is Direct.</p>
        </div>
      )}

      <div className="wh-src-channels">
        <span className="src-hint">{channel ? <>Showing <strong>{CHANNELS.find((c) => c.key === channel)?.label}</strong> · <button type="button" className="src-link" onClick={() => { setChannel(''); setOpen(null) }}>show all channels</button></> : 'Tap a channel card to see only that channel.'}</span>
        <input className="wh-src-find" type="search" placeholder="Search campaign or ad…" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search campaign or ad" />
      </div>

      {!data ? <p className="wh-empty">Loading…</p> : (
        <>
          <div className="src-cards">
            {channelCards.map((c) => (
              <button key={c.key} type="button" className={`src-card${channel === c.key ? ' is-active' : ''}`} aria-pressed={channel === c.key}
                onClick={() => { setChannel(channel === c.key ? '' : c.key); setOpen(null) }}>
                <span className="src-card-label">{c.label}</span>
                <strong className="src-card-value">{rupees(c.revenue)}</strong>
                <span className="src-card-note">{c.orders} order{c.orders === 1 ? '' : 's'} · {c.visits.toLocaleString('en-IN')} visits</span>
                <span className="src-card-bar"><span style={{ width: totalRevenue ? `${(c.revenue / totalRevenue) * 100}%` : 0 }} /></span>
              </button>
            ))}
            {!channelCards.length && <p className="wh-empty">No visits or orders in this period yet.</p>}
          </div>

          {groups.map((g) => {
            const closed = shut[g.key] ?? (g.key === 'test' || (!channel && !g.orders && !needle))
            const many = shut[g.key + ':all'] ? g.list : g.list.slice(0, 5)
            return (
              <section key={g.key} className={`src-group${g.key === 'test' ? ' is-test' : ''}`}>
                <button type="button" className="src-group-head" aria-expanded={!closed} onClick={() => setShut((x) => ({ ...x, [g.key]: !closed }))}>
                  <span className="src-caret" aria-hidden="true">{closed ? '▸' : '▾'}</span>
                  <strong>{g.label}</strong>
                  <span className="src-group-sum">{rupees(g.revenue)} · {g.orders} order{g.orders === 1 ? '' : 's'} · {g.visits.toLocaleString('en-IN')} visits · {g.list.length} campaign{g.list.length === 1 ? '' : 's'}</span>
                </button>
                {!closed && (
                  <div className="src-table-wrap">
                    <table className="src-table">
                      <thead>
                        <tr><th>Campaign</th><th className="is-num">Visits</th><th className="is-num">Checkouts</th><th className="is-num">Orders</th><th className="is-num">Visit → order</th><th className="is-num">Revenue</th></tr>
                      </thead>
                      <tbody>
                        {many.map((c) => {
                          const key = g.key + '|' + c.name
                          const isOpen = shut[key]
                          return [
                            <tr key={key} className={`src-camp${isOpen ? ' is-open' : ''}`} onClick={() => setShut((x) => ({ ...x, [key]: !isOpen }))}>
                              <td>
                                <span className="src-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                                <button type="button" className="src-camp-name" aria-expanded={Boolean(isOpen)}>{c.name}</button>
                                {c.rows.length > 1 && <span className="src-sub">{c.rows.length} ads / placements</span>}
                              </td>
                              <td className="is-num">{c.visits.toLocaleString('en-IN') || '—'}</td>
                              <td className="is-num">{c.checkouts}</td>
                              <td className="is-num"><strong>{c.orders}</strong></td>
                              <td className="is-num">{c.visits ? pct(c.orders, c.visits) : '—'}</td>
                              <td className="is-num"><strong>{rupees(c.revenue)}</strong></td>
                            </tr>,
                            ...(isOpen ? c.rows.map((r) => (
                              <tr key={key + '|' + r.source + '|' + r.campaign + '|' + r.ad} className="src-row">
                                <td>
                                  <i className="wh-src-dot" style={{ background: TONE[r.source] || '#8a7766' }} />{r.detail}
                                  {isUntaggedMetaAd(r) && <span className="wh-src-untagged" title="The ad's link has no utm_medium=paid, so it was recorded as a normal visit.">link not tagged as ad</span>}
                                  {r.orders > 0 && (
                                    <button type="button" className="src-show" onClick={(e) => { e.stopPropagation(); showOrders(r) }}>
                                      {open?.key === rowKey(r) ? 'Hide orders' : 'Show orders'}
                                    </button>
                                  )}
                                  {open?.key === rowKey(r) && (
                                    <ul className="src-orders">
                                      {!open.orders.length && <li className="wh-muted">No paid orders found for this row.</li>}
                                      {open.orders.map((o) => (
                                        <li key={o.order_number}>
                                          <strong className="wh-mono">{o.order_number}</strong> · {o.contact_name}{o.city ? `, ${o.city}` : ''} · <span className="wh-muted">{o.items}</span> · <strong>{rupees(o.total)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td className="is-num">{r.visits ?? '—'}</td>
                                <td className="is-num">{r.checkouts}</td>
                                <td className="is-num">{r.orders}</td>
                                <td className="is-num">{r.visits ? pct(r.orders, r.visits) : '—'}</td>
                                <td className="is-num">{rupees(r.revenue)}</td>
                              </tr>
                            )) : []),
                          ]
                        })}
                      </tbody>
                    </table>
                    {g.list.length > 5 && (
                      <button type="button" className="src-more" onClick={() => setShut((x) => ({ ...x, [g.key + ':all']: !x[g.key + ':all'] }))}>
                        {shut[g.key + ':all'] ? 'Show fewer' : `Show all ${g.list.length} campaigns`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )
          })}
          {data && !groups.length && channelCards.length > 0 && <p className="wh-empty">Nothing matches this filter.</p>}
        </>
      )}
    </section>
    <SourcePeople rq={rq} product={product} channel={channel} say={say} onAuthError={onAuthError} />
    <ContestLeads rq={rq} range={range} channel={channel} say={say} onAuthError={onAuthError} />
    </>
  )
}

/** Everyone who checked out from the chosen channel, one by one (paid or not). */
function SourcePeople({ rq, product, channel, say, onAuthError }) {
  const [people, setPeople] = useState(null)
  const [paidOnly, setPaidOnly] = useState(false)
  useEffect(() => {
    let live = true
    setPeople(null)
    const sources = (CHANNELS.find((c) => c.key === channel)?.sources || []).join(',')
    staffJson(`/api/admin/warehouse/sources/people?${rq}&product=${encodeURIComponent(product)}&sources=${sources}`)
      .then((d) => live && setPeople(d.people))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [rq, product, channel, say, onAuthError])
  const list = (people || []).filter((p) => !paidOnly || p.paid)
  const name = CHANNELS.find((c) => c.key === channel)?.label
  function downloadCsv() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [['Order', 'Name', 'Mobile', 'Email', 'City', 'Items', 'Amount', 'Paid', 'Came from', 'Campaign', 'Ad', 'Date'],
      ...list.map((p) => [p.order_number, p.contact_name, p.contact_phone, p.contact_email, p.city, p.items, p.total, p.paid ? 'Paid' : 'Not paid', p.label, p.campaign, p.ad, dayLabel(p.created_at).text])]
      .map((r) => r.map(cell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }))
    a.download = `buyers-${channel || 'all'}.csv`
    document.body.appendChild(a); a.click(); a.remove()
  }
  return (
    <section className="wh-panel wh-src">
      <header className="wh-src-head">
        <div>
          <h2 className="wh-panel-title">People who checked out{channel ? ` — ${name}` : ''}</h2>
          <p className="wh-muted wh-small">Each buyer one by one: who, mobile, what they ordered, paid or not, and the campaign and ad that brought them{people ? ` · ${list.length} in this period` : ''}.</p>
        </div>
        <div className="wh-src-filters">
          <label className="wh-src-check"><input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} /> Paid only</label>
          <button type="button" className="wh-btn wh-btn--outline" onClick={downloadCsv} disabled={!list.length}>Download CSV</button>
        </div>
      </header>
      {!people ? <p className="wh-empty">Loading…</p> : !list.length ? (
        <p className="wh-empty">No checkouts from {channel ? 'this channel' : 'any source'} in this period.</p>
      ) : (
        <ul className="wh-src-orders wh-src-people">
          {list.map((p) => (
            <li key={p.order_number}>
              <strong className="wh-mono">{p.order_number}</strong>
              <span><strong>{p.contact_name}</strong>{p.city ? `, ${p.city}` : ''}</span>
              <a className="wh-mono" href={`tel:${String(p.contact_phone).replace(/[^\d+]/g, '')}`}>{p.contact_phone}</a>
              <span className="wh-muted wh-small">{p.items}</span>
              <span><i className="wh-src-dot" style={{ background: TONE[p.source] || '#8a7766' }} />{p.label}{p.campaign ? ` · ${p.campaign}` : ''}{p.ad ? ` · ${p.ad}` : ''}</span>
              <span className="wh-muted wh-small">{dayLabel(p.created_at).text}</span>
              <span className={`wh-src-paid${p.paid ? ' is-paid' : ''}`}>{p.paid ? 'Paid' : 'Not paid'}</span>
              <strong>{rupees(p.total)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** New leads, as the Analyst dashboard counts them: contest sign-ups, new WhatsApp chats and expo QR leads. */
const LEAD_FILTERS = [
  { key: '', label: 'All' },
  { key: 'meta', label: 'Meta ads', sources: ['meta_ads_instagram', 'meta_ads_facebook', 'meta_ads'] },
  { key: 'google', label: 'Google Ads', sources: ['google_ads'] },
  { key: 'whatsapp', label: 'WhatsApp form', sources: ['whatsapp'] },
  { key: 'chat', label: 'WhatsApp chats', sources: ['whatsapp_chat'] },
  { key: 'expo', label: 'Expo QR', sources: ['expo'] },
  { key: 'other', label: 'Other' },
]
const leadFilterOf = (source) => LEAD_FILTERS.find((f) => f.sources?.includes(source))?.key || 'other'
const PAGE_SIZES = [10, 15, 25, 50]

function ContestLeads({ rq, range, channel = '', say, onAuthError }) {
  const [leads, setLeads] = useState(null)
  const [today, setToday] = useState(null)
  const [kind, setKind] = useState('')
  const [find, setFind] = useState('')
  const [size, setSize] = useState(15)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let live = true
    setLeads(null)
    staffJson(`/api/admin/warehouse/contest-leads?${rq}`)
      .then((d) => live && setLeads(d.leads))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [rq, say, onAuthError])

  // Today's sign-ups, whatever period is chosen above.
  useEffect(() => {
    let live = true
    const day = istToday()
    staffJson(`/api/admin/warehouse/contest-leads?from=${day}&to=${day}`)
      .then((d) => live && setToday(d.leads || []))
      .catch(() => {})
    return () => { live = false }
  }, [rq])

  // Back to page 1 whenever what is listed changes.
  useEffect(() => { setPage(1) }, [rq, kind, find, size, channel])

  const needle = find.trim().toLowerCase()
  const inPeriod = (leads || []).filter((l) => inChannel(channel, l.source))
  const counts = Object.fromEntries(LEAD_FILTERS.map((f) => [f.key, f.key ? inPeriod.filter((l) => leadFilterOf(l.source) === f.key).length : inPeriod.length]))
  const list = inPeriod.filter((l) => (!kind || leadFilterOf(l.source) === kind)
    && (!needle || `${l.name} ${l.phone} ${l.email} ${l.campaign} ${l.ad}`.toLowerCase().includes(needle)))
  const pages = Math.max(1, Math.ceil(list.length / size))
  const at = Math.min(page, pages)
  const shown = list.slice((at - 1) * size, at * size)
  const todayBy = (key) => (today || []).filter((l) => leadFilterOf(l.source) === key).length

  async function downloadCsv() {
    try {
      const res = await staffFetch(`/api/admin/warehouse/contest-leads.csv?${rq}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `new-leads-${range.from}-to-${range.to}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }

  return (
    <section className="wh-panel wh-src">
      <header className="wh-src-head">
        <div>
          <h2 className="wh-panel-title">New leads: contest sign-ups, WhatsApp chats and expo QR</h2>
          <p className="wh-muted wh-small">
            The same leads the Analyst dashboard counts as New leads: Super Slogan Contest sign-ups, people who messaged
            our WhatsApp for the first time, and expo QR leads, by the day they first came
            {leads ? ` · ${inPeriod.length} from ${range.from === range.to ? range.from : `${range.from} to ${range.to}`}` : ''}.
          </p>
        </div>
        <button type="button" className="wh-btn wh-btn--outline" onClick={downloadCsv} disabled={!leads?.length}>Download CSV</button>
      </header>

      <div className="lead-today" aria-live="polite">
        <div className="lead-today-main">
          <span className="wh-muted wh-small">Today</span>
          <strong>{today ? today.length : '…'}</strong>
          <span className="wh-muted wh-small">new lead{today?.length === 1 ? '' : 's'}</span>
        </div>
        {today && today.length > 0 && (
          <div className="lead-today-split">
            {LEAD_FILTERS.filter((f) => f.key && todayBy(f.key)).map((f) => <span key={f.key}>{f.label} <strong>{todayBy(f.key)}</strong></span>)}
          </div>
        )}
      </div>

      <div className="lead-tools">
        <div className="lead-chips" role="group" aria-label="Filter new leads by type">
          {LEAD_FILTERS.map((f) => (
            <button key={f.key} type="button" className={`lead-chip${kind === f.key ? ' is-active' : ''}`} aria-pressed={kind === f.key} onClick={() => setKind(f.key)}>
              {f.label} <span>{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input className="wh-src-find" type="search" placeholder="Search name, mobile, campaign…" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search sign-ups" />
      </div>

      {!leads ? <p className="wh-empty">Loading…</p> : !list.length ? (
        <p className="wh-empty">{inPeriod.length ? 'No leads match this filter.' : 'No new leads in this period yet.'}</p>
      ) : (
        <>
          <ul className="wh-src-orders wh-src-leads">
            {shown.map((l) => (
              <li key={l.source + l.phone}>
                <strong>{l.name}</strong>
                <a className="wh-mono" href={`tel:+91${l.phone}`}>{l.phone}</a>
                {l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : <span className="wh-muted">—</span>}
                <span><i className="wh-src-dot" style={{ background: TONE[l.source] || '#8a7766' }} />{l.sourceLabel}{l.campaign && l.source !== 'expo' ? ` · ${l.campaign}` : ''}{l.ad ? ` · ${l.ad}` : ''}{l.message ? <span className="wh-muted"> · “{String(l.message).slice(0, 60)}”</span> : null}</span>
                <span className="wh-muted wh-small">{dayLabel(l.created_at).text}</span>
              </li>
            ))}
          </ul>
          <nav className="lead-pager" aria-label="Sign-up pages">
            <span className="wh-muted wh-small">{(at - 1) * size + 1}–{Math.min(at * size, list.length)} of {list.length}</span>
            <span className="lead-pager-btns">
              <button type="button" className="wh-btn wh-btn--outline" disabled={at <= 1} onClick={() => setPage(at - 1)}>‹ Previous</button>
              <span className="wh-small">Page {at} of {pages}</span>
              <button type="button" className="wh-btn wh-btn--outline" disabled={at >= pages} onClick={() => setPage(at + 1)}>Next ›</button>
            </span>
            <label className="wh-small lead-pager-size">Show
              <span className="wh-select"><select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select></span>
              per page</label>
          </nav>
        </>
      )}
    </section>
  )
}
