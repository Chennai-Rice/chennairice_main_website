import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Confirm, Icon } from './shared.jsx'
import './analyst.css'

// The Analyst page (owner and IT team): the KPIs of "Sales Dashboard KPIs"
// (Oct 2026) — sales, leads and conversion, campaigns, delivery and location,
// and the CEO / MD daily numbers — from GET /api/admin/analyst.

const BAR = '#a3364a' // the panel's chart maroon (validated in OtherViews.jsx)
const RICE = { raw: 'Raw', idli: 'Idli', boiled: 'Boiled' }
// Order sources as the Reports page names them (attribution.js SOURCES).
const SOURCE = {
  meta_ads_facebook: 'Meta ad · Facebook', meta_ads_instagram: 'Meta ad · Instagram', meta_ads: 'Meta ad', google_ads: 'Google Ads',
  facebook: 'Facebook (not an ad)', instagram: 'Instagram (not an ad)', google_search: 'Google search', whatsapp: 'WhatsApp',
  expo: 'Expo QR', other_website: 'Other website', direct: 'Direct / typed the address',
}
const TABS = [
  { key: 'ceo', label: 'CEO / MD report' },
  { key: 'sales', label: 'Sales' },
  { key: 'leads', label: 'Leads & conversion' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'delivery', label: 'Delivery & location' },
  { key: 'settings', label: 'Settings' },
]

const IST = 330 * 60000
const today = () => new Date(Date.now() + IST).toISOString().slice(0, 10)
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
function preset(key) {
  const t = today()
  if (key === 'today') return { from: t, to: t }
  if (key === 'yesterday') return { from: addDays(t, -1), to: addDays(t, -1) }
  if (key === 'week') {
    const dow = (new Date(Date.parse(t + 'T00:00:00Z')).getUTCDay() + 6) % 7 // Monday = 0
    return { from: addDays(t, -dow), to: t }
  }
  if (key === '30') return { from: addDays(t, -29), to: t }
  return { from: t.slice(0, 8) + '01', to: t }
}

const inr = (n, dp = 0) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const kg = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} t` : `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`)
const pct = (n) => (n == null ? '—' : `${n}%`)
const count = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'))
const dayFmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
function greeting() {
  const h = new Date(Date.now() + IST).getUTCHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** A stat card: label and icon on top, the number, then a change badge and a note. */
function Tile({ label, value, note, icon = 'reports', alert = false, hero = false, delta, goodWhenDown = false }) {
  const dir = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const good = dir === 'flat' ? null : (dir === 'up') !== goodWhenDown
  return (
    <div className={`an-stat${hero ? ' is-hero' : ''}${alert ? ' is-alert' : ''}`}>
      <div className="an-stat-top">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      </div>
      <strong className="an-stat-value">{value}</strong>
      <div className="an-stat-foot">
        {dir && (
          <span className={`an-delta ${good === null ? '' : good ? 'is-good' : 'is-bad'}`} title="Against the same number of days just before">
            {dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'} {Math.abs(delta)}%
          </span>
        )}
        {note && <span className="an-stat-note">{note}</span>}
      </div>
    </div>
  )
}

/** Horizontal bars, one hue, each labelled (identity is the label, never the colour). */
function Bars({ rows, value, format = count, label, sub, empty = 'Nothing in this period.' }) {
  const max = Math.max(1, ...rows.map(value))
  if (!rows.length) return <p className="wh-empty">{empty}</p>
  return (
    <ul className="wh-hbars an-bars">
      {rows.map((r, i) => (
        <li key={label(r) + i} title={`${label(r)}: ${format(value(r))}`}>
          <span className="wh-hbar-label">{label(r)}{sub && <span className="wh-muted"> {sub(r)}</span>}</span>
          <span className="wh-hbar-track"><span className="wh-hbar" style={{ width: `${(value(r) / max) * 100}%`, background: BAR }} /></span>
          <span className="wh-hbar-value">{format(value(r))}</span>
        </li>
      ))}
    </ul>
  )
}

/** Revenue (or orders) per day: one bar per day, hover / focus for the day's numbers. */
function Trend({ days, measure }) {
  const [hover, setHover] = useState(null)
  const get = (d) => (measure === 'orders' ? d.orders : measure === 'kg' ? d.kg : d.revenue)
  const fmt = measure === 'orders' ? count : measure === 'kg' ? kg : inr
  const max = Math.max(1, ...days.map(get))
  const ticks = [0, max / 2, max]
  return (
    <figure className="wh-chart an-trend">
      <div className="wh-chart-plot" onMouseLeave={() => setHover(null)}>
        <div className="wh-chart-axis" aria-hidden="true">{ticks.slice().reverse().map((t) => <span key={t}>{fmt(Math.round(t))}</span>)}</div>
        <div className="wh-chart-bars" style={{ '--n': days.length }}>
          {ticks.map((t) => <span key={'g' + t} className="wh-chart-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
          {days.map((d, i) => (
            <button key={d.day} type="button" className="wh-chart-hit" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
              aria-label={`${dayFmt(d.day)}: ${inr(d.revenue)}, ${d.orders} orders, ${kg(d.kg)}`}>
              <span className="wh-chart-bar" style={{ height: `${(get(d) / max) * 100}%`, background: BAR, opacity: hover === null || hover === i ? 1 : 0.55 }} />
            </button>
          ))}
          {hover !== null && (
            <div className="wh-chart-tip" style={{ left: `${((hover + 0.5) / days.length) * 100}%` }} role="status">
              <strong>{dayFmt(days[hover].day)}</strong>
              <span>{inr(days[hover].revenue)} · {days[hover].orders} orders · {kg(days[hover].kg)}</span>
            </div>
          )}
        </div>
      </div>
      {days.length > 1 && (
        <figcaption className="an-trend-x"><span>{dayFmt(days[0].day)}</span><span>{dayFmt(days[days.length - 1].day)}</span></figcaption>
      )}
    </figure>
  )
}

function Table({ cols, rows, empty = 'Nothing in this period.', rowClass }) {
  if (!rows.length) return <p className="wh-empty">{empty}</p>
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead><tr>{cols.map((c) => <th key={c.label} className={c.num ? 'is-num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={rowClass?.(r) || ''}>
              {cols.map((c) => <td key={c.label} className={c.num ? 'is-num' : ''} data-label={c.label}>{c.value(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Panel({ title, note, children, wide }) {
  return (
    <section className={`an-card an-panel${wide ? ' an-panel--wide' : ''}`}>
      <h2 className="an-card-title">{title}</h2>
      {note && <p className="wh-muted wh-small an-note">{note}</p>}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ tabs */

function CeoReport({ ceo }) {
  const y = ceo.yesterday
  const m = ceo.monthToDate
  const target = ceo.target
  const rows = [
    ['Revenue', inr(y.revenue), inr(m.revenue)],
    ['Orders', count(y.orders), count(m.orders)],
    ['Kg / tonnes sold', kg(y.kg), `${kg(m.kg)}${target ? ` of ${kg(target)} target (${Math.round((m.kg / target) * 100)}%)` : ' — set a monthly target in Settings'}`],
    ['New leads', count(y.newLeads), count(m.newLeads)],
    ['Conversion rate (orders ÷ new leads)', pct(y.conversion), pct(m.conversion)],
    ['Overdue follow-ups (now)', count(ceo.overdueFollowUps), count(ceo.overdueFollowUps)],
    ['Cost per order', y.costPerOrder == null ? '—' : inr(y.costPerOrder), m.costPerOrder == null ? (m.adSpend ? 'No orders yet' : 'Enter ad spend') : inr(m.costPerOrder)],
    ['Orders pending dispatch (now)', count(ceo.pendingDispatch), count(ceo.pendingDispatch)],
  ]
  // The 8 numbers as cards: this month so far, with yesterday under it.
  const cards = [
    { label: 'Revenue', value: inr(m.revenue), note: `Yesterday ${inr(y.revenue)}`, icon: 'reports', hero: true },
    { label: 'Orders', value: count(m.orders), note: `Yesterday ${count(y.orders)}`, icon: 'orders' },
    { label: 'Kg sold', value: kg(m.kg), note: target ? `${Math.round((m.kg / target) * 100)}% of ${kg(target)} target · yesterday ${kg(y.kg)}` : `Yesterday ${kg(y.kg)} · set a target in Settings`, icon: 'box' },
    { label: 'New leads', value: count(m.newLeads), note: `Yesterday ${count(y.newLeads)}`, icon: 'users' },
    { label: 'Conversion rate', value: pct(m.conversion), note: `Yesterday ${pct(y.conversion)} · orders ÷ new leads`, icon: 'check' },
    { label: 'Overdue follow-ups', value: count(ceo.overdueFollowUps), note: 'Right now · target 0', icon: 'returns', alert: ceo.overdueFollowUps > 0 },
    { label: 'Cost per order', value: m.costPerOrder == null ? '—' : inr(m.costPerOrder), note: m.costPerOrder == null ? (m.adSpend ? 'No campaign orders yet' : 'Enter ad spend in Settings') : `Yesterday ${y.costPerOrder == null ? '—' : inr(y.costPerOrder)}`, icon: 'print' },
    { label: 'Pending dispatch', value: count(ceo.pendingDispatch), note: 'Paid, not yet shipped · right now', icon: 'truck', alert: ceo.pendingDispatch > 0 },
  ]
  return (
    <>
      <section className="an-stats an-stats--4">
        {cards.map((c) => <Tile key={c.label} {...c} />)}
      </section>
    <Panel title="Daily CEO / MD report" note={`Yesterday (${dayFmt(y.day)}) and this month so far (${dayFmt(m.from)} – ${dayFmt(m.to)}). The same 8 numbers every morning.`} wide>
      <div className="an-table-wrap">
        <table className="an-table an-ceo">
          <thead><tr><th>#</th><th>Number</th><th className="is-num">Yesterday</th><th className="is-num">Month to date</th></tr></thead>
          <tbody>
            {rows.map(([label, a, b], i) => (
              <tr key={label} className={i === 5 && ceo.overdueFollowUps ? 'is-alert' : ''}>
                <td>{i + 1}</td><td>{label}</td><td className="is-num" data-label="Yesterday">{a}</td><td className="is-num" data-label="Month to date">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
    </>
  )
}

function SalesTab({ data, rice }) {
  const s = data.sales
  const [measure, setMeasure] = useState('revenue')
  const t = data.target
  return (
    <>
      <section className="an-stats">
        <Tile hero label="Total revenue" value={inr(s.revenue)} delta={data.previous?.revenue} note={rice ? 'Item value, no delivery' : 'Paid orders, with delivery'} icon="reports" />
        <Tile label="Total orders" value={count(s.orders)} delta={data.previous?.orders} note="Paid, not cancelled" icon="orders" />
        <Tile label="Revenue per day" value={inr(s.revenuePerDay)} note={`Over ${data.period.days} day${data.period.days === 1 ? '' : 's'}`} icon="calendar" />
        <Tile label="Orders per day" value={s.ordersPerDay} note={`Over ${data.period.days} day${data.period.days === 1 ? '' : 's'}`} icon="calendar" />
        <Tile label="Average order value" value={inr(s.aov)} delta={data.previous?.aov} note="Revenue ÷ orders" icon="print" />
        <Tile label="Kg sold" value={kg(s.kg)} delta={data.previous?.kg} note={t.kgPerMonth ? `This month ${kg(t.kgThisMonth)} of ${kg(t.kgPerMonth)} (${t.percent}%)` : 'Set a monthly target in Settings'} icon="box" />
        <Tile label="Repeat customers" value={pct(s.repeat.percent)} note={`${s.repeat.repeat} of ${s.repeat.customers} buyers have 2+ orders`} icon="users" />
      </section>
      {t.kgPerMonth ? (
        <div className="an-target" title={`${kg(t.kgThisMonth)} of ${kg(t.kgPerMonth)}`}>
          <span className="an-target-label">Kg this month vs target</span>
          <span className="an-target-track"><span style={{ width: `${Math.min(100, t.percent || 0)}%`, background: BAR }} /></span>
          <span className="an-target-value">{kg(t.kgThisMonth)} / {kg(t.kgPerMonth)}</span>
        </div>
      ) : null}

      <div className="an-grid">
        <Panel title="Sales per day" wide>
          <div className="an-seg" role="group" aria-label="Measure">
            {[['revenue', 'Revenue'], ['orders', 'Orders'], ['kg', 'Kg']].map(([k, l]) => (
              <button key={k} type="button" className={`wh-tab${measure === k ? ' is-active' : ''}`} aria-pressed={measure === k} onClick={() => setMeasure(k)}>{l}</button>
            ))}
          </div>
          <Trend days={s.perDay} measure={measure} />
        </Panel>
        <Panel title="By rice type" note="Item value, without delivery.">
          <Bars rows={s.byRice} value={(r) => r.revenue} format={inr} label={(r) => RICE[r.riceType]} sub={(r) => `· ${r.orders} orders · ${kg(r.kg)}`} />
        </Panel>
        <Panel title="Average order value by source">
          <Table cols={[
            { label: 'Source', value: (r) => SOURCE[r.source] || r.source.replace(/_/g, ' ') },
            { label: 'Orders', value: (r) => count(r.orders), num: true },
            { label: 'Revenue', value: (r) => inr(r.revenue), num: true },
            { label: 'Avg order', value: (r) => inr(r.aov), num: true },
          ]} rows={s.bySource} />
        </Panel>
        <Panel title="Product-wise revenue" wide>
          <Table cols={[
            { label: 'Product', value: (r) => <strong>{r.name}</strong> },
            { label: 'Rice type', value: (r) => RICE[r.riceType] },
            { label: 'Revenue', value: (r) => inr(r.revenue), num: true },
            { label: 'Share', value: (r) => <span className="an-share"><span style={{ width: `${Math.max(2, (r.share || 0) * 0.7)}px`, background: BAR }} />{pct(r.share)}</span>, num: true },
            { label: 'Kg', value: (r) => kg(r.kg), num: true },
            { label: 'Packs', value: (r) => count(r.packs), num: true },
            { label: 'Orders', value: (r) => count(r.orders), num: true },
          ]} rows={s.byProduct} />
        </Panel>
      </div>
    </>
  )
}

function LeadsTab({ data }) {
  const l = data.leads
  const nl = l.newLeads
  const sources = Object.entries(nl.bySource).map(([source, n]) => ({ source, n }))
  if (nl.whatsappChats) sources.push({ source: 'WhatsApp chats (AskEva)', n: nl.whatsappChats })
  return (
    <>
      <section className="an-stats">
        <Tile hero label="New leads" value={count(nl.total)} delta={data.previous?.newLeads} note="Sign-ups, expo QR, WhatsApp chats" icon="users" />
        <Tile label="Contacted leads" value={count(l.contacted.total)} note="Called on NeoDove in this period" icon="truck" />
        <Tile label="Conversion rate" value={pct(l.conversion)} note="Paid orders ÷ new leads" icon="reports" />
        <Tile label="Time to convert" value={l.daysToConvert == null ? '—' : `${l.daysToConvert} days`} note="Lead to first paid order" icon="calendar" />
        <Tile label="Overdue follow-ups" value={count(l.overdue.total)} note="Follow-up date passed · target 0" alert={l.overdue.total > 0} icon="returns" />
      </section>
      <div className="an-grid">
        <Panel title="New leads by source">
          <Bars rows={sources} value={(r) => r.n} label={(r) => r.source} />
        </Panel>
        <Panel title="Lead funnel" note="Website sign-ups and expo leads of this period, and how far each got.">
          <Bars rows={l.funnel} value={(r) => r.n} label={(r) => r.stage} sub={(r) => (l.funnel[0].n ? `· ${Math.round((r.n / l.funnel[0].n) * 100)}%` : '')} />
        </Panel>
        <Panel title="Conversion by source" wide>
          <Table cols={[
            { label: 'Source', value: (r) => <strong>{r.source}</strong> },
            { label: 'Leads', value: (r) => count(r.leads), num: true },
            { label: 'Won (paid)', value: (r) => count(r.won), num: true },
            { label: 'Conversion', value: (r) => pct(r.conversion), num: true },
            { label: 'Days to convert', value: (r) => (r.daysToConvert == null ? '—' : r.daysToConvert), num: true },
          ]} rows={l.bySource} />
        </Panel>
        <Panel title="Contacted, by caller" note="NeoDove call results received in this period.">
          <Table cols={[
            { label: 'Caller', value: (r) => r.caller },
            { label: 'Leads called', value: (r) => count(r.leads), num: true },
            { label: 'Calls', value: (r) => count(r.calls), num: true },
          ]} rows={l.contacted.byCaller} empty="No NeoDove calls in this period." />
        </Panel>
        <Panel title="Overdue follow-ups, by caller" note="Now — the follow-up date set on the last NeoDove call has passed.">
          <Bars rows={l.overdue.byCaller} value={(r) => r.n} label={(r) => r.caller} empty="None overdue." />
        </Panel>
        <Panel title="Overdue follow-ups" wide>
          <Table cols={[
            { label: 'Due', value: (r) => <span className="an-bad">{when(r.due)}</span> },
            { label: 'Name', value: (r) => r.name || '—' },
            { label: 'Mobile', value: (r) => <a href={`tel:${r.mobile}`}>{r.mobile}</a> },
            { label: 'Caller', value: (r) => r.caller },
            { label: 'Last result', value: (r) => [r.result, r.remark].filter(Boolean).join(' · ') || '—' },
          ]} rows={l.overdue.list} empty="No overdue follow-ups." />
        </Panel>
        <Panel title="Lost reasons — leads" note="NeoDove calls marked Not qualified in this period.">
          <Bars rows={l.lost.leads} value={(r) => r.n} label={(r) => r.reason} empty="No lost leads in this period." />
        </Panel>
        <Panel title="Lost reasons — orders" note="Orders cancelled in this period.">
          <Bars rows={l.lost.orders} value={(r) => r.n} label={(r) => r.reason} empty="No cancelled orders in this period." />
        </Panel>
      </div>
    </>
  )
}

function CampaignsTab({ data, onAdd }) {
  const c = data.campaigns
  // Cost per lead / order and ROAS over the campaigns that have spend entered.
  const totals = c.byCampaign.filter((r) => r.spend > 0).reduce((a, r) => ({ leads: a.leads + r.leads, orders: a.orders + r.orders, revenue: a.revenue + r.revenue }), { leads: 0, orders: 0, revenue: 0 })
  const adCols = [
    { label: 'Ad', value: (r) => <strong>{r.ad}</strong> },
    { label: 'Campaign', value: (r) => r.campaign },
    { label: 'Spend', value: (r) => inr(r.spend), num: true },
    { label: 'Orders', value: (r) => count(r.orders), num: true },
    { label: 'Cost per order', value: (r) => (r.costPerOrder == null ? 'No orders' : inr(r.costPerOrder)), num: true },
  ]
  return (
    <>
      <section className="an-stats">
        <Tile hero label="Ad spend" value={inr(c.totalSpend)} note="Entered under Settings" icon="print" />
        <Tile label="Cost per lead" value={c.totalSpend && totals.leads ? inr(c.totalSpend / totals.leads) : '—'} note={`${count(totals.leads)} leads from campaigns with spend`} icon="users" />
        <Tile label="Cost per order" value={c.totalSpend && totals.orders ? inr(c.totalSpend / totals.orders) : '—'} note={`${count(totals.orders)} orders from campaigns with spend`} icon="orders" />
        <Tile label="ROAS" value={c.totalSpend ? `${(totals.revenue / c.totalSpend).toFixed(2)}×` : '—'} note="Revenue ÷ spend · above 1 earns more than it costs" icon="reports" />
      </section>
      <div className="an-grid">
        <Panel title="By campaign" note="Leads and paid orders are matched to ad spend by the campaign name in the ad's link (utm_campaign). Judge a campaign on cost per order." wide>
          <Table cols={[
            { label: 'Campaign', value: (r) => <strong>{r.campaign}</strong> },
            { label: 'Platform', value: (r) => (r.platform ? r.platform[0].toUpperCase() + r.platform.slice(1) : '—') },
            { label: 'Spend', value: (r) => inr(r.spend), num: true },
            { label: 'Leads', value: (r) => count(r.leads), num: true },
            { label: 'Cost / lead', value: (r) => (r.costPerLead == null ? '—' : inr(r.costPerLead)), num: true },
            { label: 'Orders', value: (r) => count(r.orders), num: true },
            { label: 'Cost / order', value: (r) => (r.costPerOrder == null ? '—' : inr(r.costPerOrder)), num: true },
            { label: 'Revenue', value: (r) => inr(r.revenue), num: true },
            { label: 'ROAS', value: (r) => (r.roas == null ? '—' : `${r.roas}×`), num: true },
          ]} rows={c.byCampaign} empty="No campaign leads, orders or ad spend in this period." />
          <button type="button" className="wh-btn wh-btn--outline wh-btn--small an-add" onClick={onAdd}>Enter ad spend</button>
        </Panel>
        <Panel title="Best ads" note="Lowest cost per order (ads with spend and at least one order).">
          <Table cols={adCols} rows={c.bestAds} empty="Needs ad spend entered per ad, and orders from those ads." />
        </Panel>
        <Panel title="Worst ads" note="Highest cost per order; ads with spend and no orders come first.">
          <Table cols={adCols} rows={c.worstAds} empty="Needs ad spend entered per ad." />
        </Panel>
      </div>
    </>
  )
}

function DeliveryTab({ data }) {
  const d = data.delivery
  const loc = data.leads.byLocation
  return (
    <>
      <section className="an-stats">
        <Tile hero label="Average delivery days" value={d.avgDeliveryDays == null ? '—' : `${d.avgDeliveryDays} days`} note="Payment to delivery, delivered in this period" icon="delivered" />
        <Tile label="Orders pending dispatch" value={count(d.pendingDispatch.total)} note="Paid, not yet shipped (now)" alert={d.pendingDispatch.total > 0} icon="truck" />
      </section>
      <div className="an-grid">
        <Panel title="Location-wise sales" note="Paid orders in this period, by delivery city." wide>
          <Bars rows={d.byCity} value={(r) => r.revenue} format={inr} label={(r) => r.city} sub={(r) => `· ${r.state} · ${r.orders} orders`} />
        </Panel>
        <Panel title="Delivery days, by state">
          <Table cols={[
            { label: 'State', value: (r) => r.state },
            { label: 'Delivered', value: (r) => count(r.orders), num: true },
            { label: 'Avg days', value: (r) => r.days, num: true },
          ]} rows={d.byState} empty="No deliveries in this period." />
        </Panel>
        <Panel title="Delivery days, by courier">
          <Table cols={[
            { label: 'Courier', value: (r) => r.courier.replace(/_/g, ' ') },
            { label: 'Delivered', value: (r) => count(r.orders), num: true },
            { label: 'Avg days', value: (r) => r.days, num: true },
          ]} rows={d.byCourier} empty="No deliveries in this period." />
        </Panel>
        <Panel title="Waiting longest for dispatch">
          <Table cols={[
            { label: 'Order', value: (r) => <span className="wh-mono">{r.order}</span> },
            { label: 'Customer', value: (r) => r.customer },
            { label: 'City', value: (r) => r.city || '—' },
            { label: 'Paid', value: (r) => when(r.placedAt) },
          ]} rows={d.pendingDispatch.oldest} empty="Nothing waiting." />
        </Panel>
        <Panel title="Open leads by location" note="Expo QR leads by the place they gave; open = no paid order yet. Website sign-ups do not ask for a city yet.">
          <Table cols={[
            { label: 'Location', value: (r) => r.location },
            { label: 'Leads', value: (r) => count(r.leads), num: true },
            { label: 'Open', value: (r) => count(r.open), num: true },
          ]} rows={loc} empty="No expo leads in this period." />
        </Panel>
      </div>
    </>
  )
}

function SettingsTab({ settings, period, say, onAuthError, reload }) {
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState(settings.kgPerMonth ?? '')
  const [form, setForm] = useState({ spentOn: today(), platform: 'meta', campaign: '', ad: '', amount: '' })
  const [confirm, setConfirm] = useState(null)
  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); if (ok) say(ok); reload() } catch (err) { if (!onAuthError(err)) say(err.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="an-grid">
      <Panel title="Enter ad spend" note="What was spent on Meta / Google ads. Use the same campaign (and ad) name as in the ad's link — utm_campaign / utm_content — so leads and orders match it." wide>
        <form className="an-form" onSubmit={(e) => { e.preventDefault(); run(() => staffJson('/api/admin/analyst/ad-spend', { method: 'POST', body: JSON.stringify(form) }), 'Ad spend saved.').then(() => setForm((f) => ({ ...f, ad: '', amount: '' }))) }}>
          <label className="wh-field"><span>Date</span><input className="wh-input" type="date" required value={form.spentOn} max={today()} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} /></label>
          <label className="wh-field"><span>Platform</span>
            <span className="wh-select"><select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="meta">Meta (Facebook / Instagram)</option><option value="google">Google Ads</option><option value="other">Other</option>
            </select></span></label>
          <label className="wh-field"><span>Campaign</span><input className="wh-input" required maxLength={200} value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="e.g. Diwali Reels" /></label>
          <label className="wh-field"><span>Ad (optional)</span><input className="wh-input" maxLength={200} value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} placeholder="e.g. Reel 3" /></label>
          <label className="wh-field"><span>Amount (₹)</span><input className="wh-input" type="number" required min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <button className="wh-btn wh-btn--primary" type="submit" disabled={busy}>Save</button>
        </form>
        <Table cols={[
          { label: 'Date', value: (r) => dayFmt(r.spentOn) },
          { label: 'Platform', value: (r) => r.platform },
          { label: 'Campaign', value: (r) => r.campaign },
          { label: 'Ad', value: (r) => r.ad || '—' },
          { label: 'Amount', value: (r) => inr(r.amount, 2), num: true },
          { label: '', value: (r) => <button type="button" className="wh-link-btn wh-small" onClick={() => setConfirm(r)}>Delete</button> },
        ]} rows={settings.adSpend} empty={`No ad spend entered for ${dayFmt(period.from)} – ${dayFmt(period.to)}.`} />
      </Panel>
      <Panel title="Monthly kg target" note="Kg sold this month is measured against this.">
        <form className="an-form an-form--row" onSubmit={(e) => { e.preventDefault(); run(() => staffJson('/api/admin/analyst/target', { method: 'PUT', body: JSON.stringify({ kgPerMonth: Number(target) || 0 }) }), 'Target saved.') }}>
          <label className="wh-field"><span>Kg per month</span><input className="wh-input" type="number" min="0" step="1" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <button className="wh-btn wh-btn--primary" type="submit" disabled={busy}>Save</button>
        </form>
      </Panel>
      <Panel title="Rice type of each product" note="Sales split Raw / Idli / Boiled by this. A change applies to past orders too.">
        <Table cols={[
          { label: 'Product', value: (r) => <>{r.name}{!r.active && <span className="wh-muted"> (not sold)</span>}</> },
          { label: 'Rice type', value: (r) => (
            <span className="wh-select"><select aria-label={`Rice type of ${r.name}`} value={r.riceType} disabled={busy}
              onChange={(e) => run(() => staffJson('/api/admin/analyst/rice-type', { method: 'PUT', body: JSON.stringify({ slug: r.slug, riceType: e.target.value }) }), `${r.name}: ${RICE[e.target.value]}.`)}>
              {Object.entries(RICE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></span>
          ) },
        ]} rows={settings.products} />
      </Panel>
      {confirm && (
        <Confirm title="Delete this ad spend?" body={`${confirm.campaign}${confirm.ad ? ' · ' + confirm.ad : ''} — ${inr(confirm.amount, 2)} on ${dayFmt(confirm.spentOn)}`}
          confirmLabel="Delete" danger busy={busy} onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => staffJson(`/api/admin/analyst/ad-spend/${confirm.id}`, { method: 'DELETE' }), 'Deleted.').then(() => setConfirm(null))} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function AnalystView({ say, onAuthError, name = '' }) {
  const firstName = String(name || '').trim().split(/\s+/)[0]
  const [tab, setTab] = useState('ceo')
  const [range, setRange] = useState('month')
  const [period, setPeriod] = useState(() => preset('month'))
  const [rice, setRice] = useState('')
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  const qs = useMemo(() => `from=${period.from}&to=${period.to}${rice ? `&rice=${rice}` : ''}`, [period, rice])
  useEffect(() => {
    let live = true
    setData(null)
    staffJson(`/api/admin/analyst?${qs}`)
      .then((d) => live && setData(d))
      .catch((err) => { if (live && !onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [qs, tick, say, onAuthError])
  useEffect(() => {
    if (tab !== 'settings') return undefined
    let live = true
    staffJson(`/api/admin/analyst/settings?from=${period.from}&to=${period.to}`)
      .then((d) => live && setSettings(d))
      .catch((err) => { if (live && !onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [tab, period, tick, say, onAuthError])

  const choose = (key) => { setRange(key); if (key !== 'custom') setPeriod(preset(key)) }

  return (
    <div className="an-page">
      <header className="an-head">
        <div>
          <h1 className="an-hello">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="an-sub">Sales, leads, campaigns and delivery for {dayFmt(period.from)} – {dayFmt(period.to)}{rice ? ` · ${RICE[rice]} rice` : ''}.</p>
        </div>
        <div className="an-controls">
          <div className="an-pills" role="group" aria-label="Period">
            {[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['30', '30 days'], ['custom', 'Custom']].map(([k, l]) => (
              <button key={k} type="button" className={`an-pill${range === k ? ' is-active' : ''}`} aria-pressed={range === k} onClick={() => choose(k)}>{l}</button>
            ))}
          </div>
          <label className="an-rice">
            <span className="visually-hidden">Rice type</span>
            <select value={rice} onChange={(e) => setRice(e.target.value)}>
              <option value="">All rice</option><option value="raw">Raw</option><option value="idli">Idli</option><option value="boiled">Boiled</option>
            </select>
          </label>
        </div>
      </header>
      {range === 'custom' && (
        <div className="an-dates">
          <label className="wh-filter"><span>From</span><input className="wh-input" type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} /></label>
          <label className="wh-filter"><span>To</span><input className="wh-input" type="date" value={period.to} min={period.from} max={today()} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} /></label>
        </div>
      )}

      <nav className="an-pills an-nav" aria-label="Analyst sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`an-pill${tab === t.key ? ' is-active' : ''}`} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'settings'
        ? (settings ? <SettingsTab settings={settings} period={period} say={say} onAuthError={onAuthError} reload={reload} /> : <p className="wh-empty">Loading…</p>)
        : !data ? <p className="wh-empty">Loading…</p>
          : tab === 'ceo' ? <CeoReport ceo={data.ceo} />
            : tab === 'sales' ? <SalesTab data={data} rice={rice} />
              : tab === 'leads' ? <LeadsTab data={data} />
                : tab === 'campaigns' ? <CampaignsTab data={data} onAdd={() => setTab('settings')} />
                  : <DeliveryTab data={data} />}
    </div>
  )
}
