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

  const totalRevenue = (data?.sources || []).reduce((t, s) => t + s.revenue, 0)

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

      {!data ? <p className="wh-empty">Loading…</p> : (
        <>
          <div className="wh-src-cards">
            {data.sources.map((s) => (
              <div key={s.source} className="wh-src-card" style={{ '--tone': TONE[s.source] || '#8a7766' }}>
                <span className="wh-src-card-label">{s.label}</span>
                <strong>{rupees(s.revenue)}</strong>
                <span className="wh-small wh-muted">{s.orders} orders · {s.packs} packs · {s.visits || 0} visits</span>
                <span className="wh-src-share"><span style={{ width: totalRevenue ? `${(s.revenue / totalRevenue) * 100}%` : 0 }} /></span>
              </div>
            ))}
            {!data.sources.length && <p className="wh-empty">No visits or orders from any source in this period yet.</p>}
          </div>

          {data.campaigns.length > 0 && (
            <div className="wh-table wh-table--src" role="table" aria-label="By campaign and ad">
              <div className="wh-tr wh-th" role="row">
                <span role="columnheader">Source</span>
                <span role="columnheader">Campaign</span>
                <span role="columnheader">Ad</span>
                <span role="columnheader">Visits</span>
                <span role="columnheader">Checkouts</span>
                <span role="columnheader">Orders</span>
                <span role="columnheader">Ordered</span>
                <span role="columnheader">Packs</span>
                <span role="columnheader">Revenue</span>
              </div>
              {data.campaigns.map((r) => (
                <div key={`${r.source}|${r.campaign}|${r.ad}`}>
                  <button type="button" className={`wh-tr wh-src-row${open?.row === r ? ' is-open' : ''}`} role="row" onClick={() => showOrders(r)}
                    disabled={!r.orders} title={r.orders ? 'Show these orders' : 'No paid orders'}>
                    <span role="cell"><i className="wh-src-dot" style={{ background: TONE[r.source] }} />{r.label}</span>
                    <span role="cell">{r.campaign || <span className="wh-muted">—</span>}</span>
                    <span role="cell">{r.ad || <span className="wh-muted">—</span>}</span>
                    <span role="cell"><span className="wh-k">Visits</span>{r.visits ?? '—'}</span>
                    <span role="cell"><span className="wh-k">Checkouts</span>{r.checkouts}</span>
                    <span role="cell"><span className="wh-k">Orders</span><strong>{r.orders}</strong></span>
                    <span role="cell"><span className="wh-k">Ordered</span>{r.visits ? pct(r.orders, r.visits) : '—'}</span>
                    <span role="cell"><span className="wh-k">Packs</span>{r.packs}</span>
                    <span role="cell"><span className="wh-k">Revenue</span><strong>{rupees(r.revenue)}</strong></span>
                  </button>
                  {open?.row === r && (
                    <ul className="wh-src-orders">
                      {open.orders.map((o) => (
                        <li key={o.order_number}>
                          <strong className="wh-mono">{o.order_number}</strong>
                          <span>{o.contact_name}{o.city ? `, ${o.city}` : ''}</span>
                          <span className="wh-muted wh-small">{o.items}</span>
                          <span className="wh-muted wh-small">{o.placed_at ? dayLabel(o.placed_at).text : ''}</span>
                          <strong>{rupees(o.total)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
    <ContestLeads days={days} say={say} onAuthError={onAuthError} />
    </>
  )
}

/** Sign-ups from the contest popup form shown to Meta and Google ad visitors. */
function ContestLeads({ days, say, onAuthError }) {
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
          <h2 className="wh-panel-title">Contest sign-ups from ads</h2>
          <p className="wh-muted wh-small">
            Name, mobile and email from the Super Slogan Contest form, shown to visitors who came from a Meta or Google ad
            {leads ? ` · ${leads.length} in this period` : ''}.
          </p>
        </div>
        <button type="button" className="wh-btn wh-btn--outline" onClick={downloadCsv} disabled={!leads?.length}>Download CSV</button>
      </header>
      {!leads ? <p className="wh-empty">Loading…</p> : !leads.length ? (
        <p className="wh-empty">No sign-ups in this period yet.</p>
      ) : (
        <ul className="wh-src-orders wh-src-leads">
          {leads.map((l) => (
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
