import { useEffect, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { dayLabel } from './shared.jsx'

// Sales by where the buyer came from: Meta ads (Facebook / Instagram), Google
// Ads, unpaid social and search, WhatsApp, other sites and direct visits —
// down to each campaign and ad, with visits → checkouts → orders → revenue.

const rupees = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')

const META_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'
const GOOGLE_SUFFIX = 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}'

const TONE = {
  meta_ads_facebook: '#1877f2', meta_ads_instagram: '#d6249f', meta_ads: '#5b6cf0', google_ads: '#34a853',
  facebook: '#7aa7f5', instagram: '#f08ac8', google_search: '#8bc79a', whatsapp: '#25d366', other_website: '#b49a6a', direct: '#8a7766',
}

// The channel filter: each button stands for these source keys.
const CHANNELS = [
  { key: '', label: 'All' },
  { key: 'meta', label: 'Meta ads', sources: ['meta_ads_instagram', 'meta_ads_facebook', 'meta_ads'] },
  { key: 'google', label: 'Google', sources: ['google_ads', 'google_search'] },
  { key: 'whatsapp', label: 'WhatsApp', sources: ['whatsapp'] },
  { key: 'social', label: 'Instagram / Facebook (not ads)', sources: ['instagram', 'facebook'] },
  { key: 'direct', label: 'Direct', sources: ['direct'] },
  { key: 'other', label: 'Other (websites, Expo QR)', sources: ['other_website', 'expo'] },
]
const inChannel = (channel, source) => !channel || (CHANNELS.find((c) => c.key === channel)?.sources || []).includes(source)
// A Meta campaign ID (e.g. 120251768166180156) means the visit came from a Meta ad, even
// when the ad's link said "facebook" / "instagram" without utm_medium=paid.
const META_ID = /^\d{12,}$/
// Names for the Meta campaign and ad IDs that ad links carry (from Meta Ads Manager, Oct 2026).
// New ads tagged with the parameters under "How to tag your ads" send their names directly.
const AD_NAMES = {
  '120251724928590156': { campaign: 'OVERVIEW CREATIVE 14/10' },
  '120251724928570156': { campaign: 'OVERVIEW CREATIVE 14/10', ad: 'slogan contest' },
  '120251713475410156': { campaign: 'SLOGAN READY TRAFFIC - 13/10' },
  '120251713475400156': { campaign: 'SLOGAN READY TRAFFIC - 13/10', ad: 'Single image' },
  '120251712405340156': { campaign: 'COUPON VANTHACHI - 13-10-26 | Awareness' },
  '120251712405330156': { campaign: 'COUPON VANTHACHI - 13-10-26 | Awareness', ad: 'Creative' },
  '120251768166170156': { campaign: 'Sales - Kichadi Ponni Rice' },
  '120251768166180156': { campaign: 'Sales - Kichadi Ponni Rice', ad: 'New Sales ad' },
}
const isMetaId = (v) => META_ID.test(v || '') || Boolean(AD_NAMES[v])
const isUntaggedMetaAd = (r) => ['facebook', 'instagram'].includes(r.source) && (isMetaId(r.campaign) || isMetaId(r.ad))
// Links whose placeholders were never filled in (<campaign-name>, {{campaign.id}}…).
const isTestLink = (r) => /\{\{|<(campaign|ad)[-_ ]?(name|id)>/i.test(`${r.campaign}${r.ad}`)
/** The channel a campaign row belongs to. */
const channelOf = (r) => (isTestLink(r) ? 'test' : isUntaggedMetaAd(r) ? 'meta' : CHANNELS.find((c) => c.sources?.includes(r.source))?.key || 'other')
const pretty = (v) => String(v || '').replace(/[<>]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
const shortId = (v) => `…${String(v).slice(-4)}`
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
  const ad = AD_NAMES[r.ad]?.ad || (META_ID.test(r.ad || '') ? `ad ${shortId(r.ad)}` : pretty(r.ad))
  const viaAd = !AD_NAMES[r.ad] && AD_NAMES[r.campaign]?.ad ? AD_NAMES[r.campaign].ad : ''
  return [r.label.replace(' (not an ad)', ''), viaAd, ad].filter(Boolean).join(' · ')
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
  const [days, setDays] = useState(30)
  const [product, setProduct] = useState('')
  const [products, setProducts] = useState([])
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null) // { row, orders }
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
    staffJson(`/api/admin/warehouse/sources?days=${days}&product=${encodeURIComponent(product)}`)
      .then((d) => live && setData(d))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [days, product, say, onAuthError])

  async function showOrders(row) {
    if (open && open.row === row) return setOpen(null)
    try {
      const q = new URLSearchParams({ days, product, source: row.source, campaign: row.campaign, ad: row.ad })
      const d = await staffJson(`/api/admin/warehouse/sources/orders?${q}`)
      setOpen({ row, orders: d.orders })
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
            <span className="wh-select"><select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select></span>
          </label>
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
                                      {open?.row === r ? 'Hide orders' : 'Show orders'}
                                    </button>
                                  )}
                                  {open?.row === r && (
                                    <ul className="src-orders">
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
    <SourcePeople days={days} product={product} channel={channel} say={say} onAuthError={onAuthError} />
    <ContestLeads days={days} channel={channel} say={say} onAuthError={onAuthError} />
    </>
  )
}

/** Everyone who checked out from the chosen channel, one by one (paid or not). */
function SourcePeople({ days, product, channel, say, onAuthError }) {
  const [people, setPeople] = useState(null)
  const [paidOnly, setPaidOnly] = useState(false)
  useEffect(() => {
    let live = true
    setPeople(null)
    const sources = (CHANNELS.find((c) => c.key === channel)?.sources || []).join(',')
    staffJson(`/api/admin/warehouse/sources/people?days=${days}&product=${encodeURIComponent(product)}&sources=${sources}`)
      .then((d) => live && setPeople(d.people))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [days, product, channel, say, onAuthError])
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

/** Sign-ups from the contest popup form shown to Meta and Google ad visitors. */
function ContestLeads({ days, channel = '', say, onAuthError }) {
  const [leads, setLeads] = useState(null)

  useEffect(() => {
    let live = true
    setLeads(null)
    staffJson(`/api/admin/warehouse/contest-leads?days=${days}`)
      .then((d) => live && setLeads(d.leads))
      .catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [days, say, onAuthError])

  async function downloadCsv() {
    try {
      const res = await staffFetch(`/api/admin/warehouse/contest-leads.csv?days=${days}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = 'contest-signups.csv'
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
          <h2 className="wh-panel-title">Contest sign-ups from ads and WhatsApp</h2>
          <p className="wh-muted wh-small">
            Name, mobile and email from the Super Slogan Contest form, shown to visitors who came from a Meta or Google ad or a WhatsApp link
            {leads ? ` · ${leads.length} in this period` : ''}.
          </p>
        </div>
        <button type="button" className="wh-btn wh-btn--outline" onClick={downloadCsv} disabled={!leads?.length}>Download CSV</button>
      </header>
      {!leads ? <p className="wh-empty">Loading…</p> : !leads.filter((l) => inChannel(channel, l.source)).length ? (
        <p className="wh-empty">No sign-ups in this period yet.</p>
      ) : (
        <ul className="wh-src-orders wh-src-leads">
          {leads.filter((l) => inChannel(channel, l.source)).map((l) => (
            <li key={l.phone}>
              <strong>{l.name}</strong>
              <a className="wh-mono" href={`tel:+91${l.phone}`}>{l.phone}</a>
              <a href={`mailto:${l.email}`}>{l.email}</a>
              <span><i className="wh-src-dot" style={{ background: TONE[l.source] || '#8a7766' }} />{l.sourceLabel}{l.campaign ? ` · ${l.campaign}` : ''}{l.ad ? ` · ${l.ad}` : ''}</span>
              <span className="wh-muted wh-small">{dayLabel(l.updated_at).text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
