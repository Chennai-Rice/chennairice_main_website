import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Card, DataTable, LoadingRegion, Segmented } from './components/ui.jsx'
import StaffGate from './StaffGate.jsx'
import { downloadCsv } from './AdvisorAnswer.jsx'
import './neodove.css'

/**
 * /admin → NeoDove (owner, IT team and the Performance (Analyst) login; owner, 27 Nov 2026): the leads that go into
 * NeoDove from Sales Daddy (Meta lead forms) and from our own database (website sign-ups, checkouts not paid,
 * enquiries, Spin & Win, referrals), kept apart, and how they perform there: called, qualified, bought.
 * Counts only, from GET /api/admin/neodove-dashboard (neodove-dashboard.js).
 */
const IST = 330 * 60000
const istToday = () => new Date(Date.now() + IST).toISOString().slice(0, 10)
const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
]
function presetRange(id) {
  const t = istToday()
  if (id === 'today') return { from: t, to: t }
  if (id === '7d') return { from: shift(t, -6), to: t }
  if (id === '30d') return { from: shift(t, -29), to: t }
  return { from: t.slice(0, 8) + '01', to: t }
}
const ORIGINS = [
  { id: 'all', label: 'Both' },
  { id: 'salesdaddy', label: 'From Sales Daddy' },
  { id: 'website', label: 'From our database' },
]

const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'))
const p = (v) => (v == null ? '—' : `${v}%`)
const inr = (v) => (v == null ? '—' : '₹' + Math.round(v).toLocaleString('en-IN'))
const hrs = (v) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${v} h`)
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never')
const ago = (iso, okMinutes) => {
  if (!iso) return { text: 'never', late: true }
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  return { text: m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`, late: m > okMinutes }
}

export default function NeodovePanel() {
  return (
    <StaffGate
      perm="analyst.view"
      title="Sign in to see NeoDove"
      why="The NeoDove dashboard shows the sales team's lead figures, so it needs a staff sign-in (owner, IT team or the Performance login)."
      deniedText="This staff account cannot see the NeoDove dashboard. Sign in as the owner, the IT team or the Performance login."
    >
      {({ onAuthError }) => <Neodove onAuthError={onAuthError} />}
    </StaffGate>
  )
}

function Neodove({ onAuthError }) {
  const [preset, setPreset] = useState('7d')
  const [range, setRange] = useState(() => presetRange('7d'))
  const [origin, setOrigin] = useState('all')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    staffJson(`/api/admin/neodove-dashboard?from=${range.from}&to=${range.to}`)
      .then((d) => { setData(d); setError('') })
      .catch((err) => { if (!onAuthError(err)) setError(err.message || 'Could not load the NeoDove dashboard.') })
      .finally(() => setLoading(false))
  }, [range, onAuthError])
  useEffect(() => { load() }, [load])

  const choose = (id) => { setPreset(id); if (id !== 'custom') setRange(presetRange(id)) }

  return (
    <div className="nd">
      <div className="nd-bar">
        <Segmented options={PRESETS} value={preset} onChange={choose} ariaLabel="Period" />
        {preset === 'custom' && (
          <span className="nd-dates">
            <input type="date" className="ad-input" value={range.from} max={range.to} aria-label="From" onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            <span className="ad-muted">to</span>
            <input type="date" className="ad-input" value={range.to} min={range.from} max={istToday()} aria-label="To" onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
          </span>
        )}
        <button type="button" className="ad-btn ad-btn-quiet" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <p className="ad-alert" role="alert">{error}</p>}
      {!data && !error && <LoadingRegion label="Loading the NeoDove dashboard" />}
      {data && (
        <>
          <Health h={data.health} />
          <div className="nd-two">
            <SalesDaddyInput t={data.input.salesdaddy} perf={data.performance.salesdaddy} />
            <WebsiteInput t={data.input.website} perf={data.performance.website} />
          </div>
          <Compare perf={data.performance} />
          <Card
            title="Performance in NeoDove"
            subtitle="Leads NeoDove accepted in this period, and what happened to them"
            actions={<Segmented options={ORIGINS} value={origin} onChange={setOrigin} ariaLabel="Where the leads came from" />}
          >
            <Breakdown title="By telecaller" first="Telecaller" rows={data.byCaller} origin={origin} file="neodove-by-telecaller" />
            <Breakdown title="By NeoDove campaign" first="Campaign" rows={data.byCampaign} origin={origin} file="neodove-by-campaign" />
            <Breakdown title="By lead type" first="Lead type" rows={data.byType} origin={origin} file="neodove-by-lead-type" />
          </Card>
          <Trend days={data.trend} />
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

function Stat({ label, value, note, tone }) {
  return (
    <div className={`nd-stat${tone ? ' is-' + tone : ''}`}>
      <span className="nd-stat-value">{value}</span>
      <span className="nd-stat-label">{label}</span>
      {note && <span className="nd-stat-note">{note}</span>}
    </div>
  )
}

function Health({ h }) {
  const sd = ago(h.lastSalesDaddyCopy, 30)
  const push = ago(h.lastPush, 24 * 60)
  const call = ago(h.lastCall, 24 * 60)
  const stuck = h.queued > 0 && h.oldestQueuedMinutes > 30
  return (
    <Card title="Right now" subtitle="Is everything flowing? The Sales Daddy copy runs every 10 minutes; leads go to NeoDove at once.">
      <div className="nd-stats">
        <Stat label="Last copy from Sales Daddy" value={sd.text} tone={sd.late ? 'bad' : 'good'} note={sd.late ? 'Should be under 30 min' : when(h.lastSalesDaddyCopy)} />
        <Stat label="Last lead pushed to NeoDove" value={push.text} note={when(h.lastPush)} />
        <Stat label="Last call result from NeoDove" value={call.text} note={when(h.lastCall)} />
        <Stat label="Waiting to go to NeoDove" value={n(h.queued)} tone={stuck ? 'bad' : h.queued ? 'warn' : 'good'}
          note={h.queued ? `Oldest ${hrs(Math.round((h.oldestQueuedMinutes / 60) * 10) / 10)} old` : 'Nothing waiting'} />
        <Stat label="Failed (gave up)" value={n(h.failed)} tone={h.failed ? 'bad' : 'good'} note={h.failed ? 'Ask the IT team to resend' : 'None'} />
      </div>
      {h.problems.length > 0 && (
        <ul className="nd-problems">
          {h.problems.map((x) => <li key={x.reason}><strong>{n(x.leads)}</strong> {x.reason}</li>)}
        </ul>
      )}
    </Card>
  )
}

function SalesDaddyInput({ t, perf }) {
  return (
    <Card className="nd-origin is-sd" title="Input from Sales Daddy" subtitle="Meta lead-form leads Sales Daddy received, copied here and sent on to NeoDove">
      <div className="nd-stats">
        <Stat label="Received from Sales Daddy" value={n(t.received)} tone="lead" />
        <Stat label="Pushed to NeoDove" value={n(t.pushed)} tone="good" note={p(t.received ? Math.round((t.pushed / t.received) * 1000) / 10 : null) + ' of received'} />
        <Stat label="Already in NeoDove" value={n(t.already)} note="Came earlier from another source, not added twice" />
        <Stat label="Waiting" value={n(t.waiting)} tone={t.waiting ? 'warn' : ''} />
        <Stat label="Failed" value={n(t.failed)} tone={t.failed ? 'bad' : ''} />
        <Stat label="Not sent" value={n(t.notQueued)} note={t.buyers ? `${n(t.buyers)} already customers` : 'Already customers or invalid numbers'} />
      </div>
      <Funnel perf={perf} />
    </Card>
  )
}

function WebsiteInput({ t, perf }) {
  return (
    <Card className="nd-origin is-web" title="Input from our database" subtitle="Website leads we push to NeoDove: ad and WhatsApp sign-ups, unpaid checkouts, enquiries, Spin & Win, referrals">
      <div className="nd-stats">
        <Stat label="Queued for NeoDove" value={n(t.queued)} tone="lead" />
        <Stat label="Pushed to NeoDove" value={n(t.pushed)} tone="good" note={p(t.queued ? Math.round((t.pushed / t.queued) * 1000) / 10 : null) + ' of queued'} />
        <Stat label="Already in NeoDove" value={n(t.already)} note="Not added twice" />
        <Stat label="Waiting" value={n(t.waiting)} tone={t.waiting ? 'warn' : ''} />
        <Stat label="Failed" value={n(t.failed)} tone={t.failed ? 'bad' : ''} />
      </div>
      {t.byType.length > 0 && (
        <div className="nd-scroll">
        <table className="nd-mini">
          <thead><tr><th>Lead type</th><th>Queued</th><th>Pushed</th><th>Already in</th><th>Waiting / failed</th></tr></thead>
          <tbody>
            {t.byType.map((r) => (
              <tr key={r.type}><td>{r.type}</td><td>{n(r.queued)}</td><td>{n(r.pushed)}</td><td>{n(r.already)}</td><td>{n(r.waiting + r.failed)}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <Funnel perf={perf} />
    </Card>
  )
}

// Pushed → called → qualified → bought, as bars.
function Funnel({ perf }) {
  const steps = [
    ['Pushed', perf.pushed],
    ['Called', perf.called],
    ['Qualified', perf.qualified],
    ['Bought', perf.converted],
  ]
  const top = Math.max(perf.pushed, 1)
  return (
    <div className="nd-funnel" aria-label="From push to purchase">
      {steps.map(([label, v]) => (
        <div key={label} className="nd-funnel-row">
          <span className="nd-funnel-label">{label}</span>
          <span className="nd-funnel-track"><span className="nd-funnel-fill" style={{ width: `${Math.max(v ? 3 : 0, (v / top) * 100)}%` }} /></span>
          <span className="nd-funnel-value">{n(v)}</span>
        </div>
      ))}
      <p className="ad-muted ad-small">Revenue from these buyers: <strong>{inr(perf.revenue)}</strong> · median time to first call {hrs(perf.medianHoursToCall)}</p>
    </div>
  )
}

const METRICS = [
  ['Pushed to NeoDove', 'pushed', n],
  ['Called', 'called', n],
  ['Not called yet', 'notCalled', n],
  ['Call rate', 'callRate', p],
  ['Median time to first call', 'medianHoursToCall', hrs],
  ['Qualified', 'qualified', n],
  ['Not qualified', 'notQualified', n],
  ['Qualified ÷ called', 'qualifiedRate', p],
  ['Bought (paid order after the push)', 'converted', n],
  ['Conversion (bought ÷ pushed)', 'conversionRate', p],
  ['Revenue', 'revenue', inr],
]

function Compare({ perf }) {
  return (
    <Card title="Sales Daddy vs our database" subtitle="The same measures side by side, for leads pushed in this period">
      <div className="an-table-wrap nd-scroll">
        <table className="nd-compare">
          <thead><tr><th>Measure</th><th>From Sales Daddy</th><th>From our database</th><th>Total</th></tr></thead>
          <tbody>
            {METRICS.map(([label, key, f]) => (
              <tr key={key}><th scope="row">{label}</th><td>{f(perf.salesdaddy[key])}</td><td>{f(perf.website[key])}</td><td><strong>{f(perf.all[key])}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Breakdown({ title, first, rows, origin, file }) {
  const list = rows.map((r) => ({ name: r.name, ...r[origin] })).filter((r) => r.pushed > 0)
  const cols = [
    { key: 'name', header: first, render: (r) => <span className="ad-strong">{r.name}</span> },
    { key: 'pushed', header: 'Leads', align: 'right', render: (r) => n(r.pushed) },
    { key: 'called', header: 'Called', align: 'right', render: (r) => n(r.called) },
    { key: 'qualified', header: 'Qualified', align: 'right', render: (r) => n(r.qualified) },
    { key: 'notQualified', header: 'Not qualified', align: 'right', render: (r) => n(r.notQualified) },
    { key: 'converted', header: 'Bought', align: 'right', render: (r) => n(r.converted) },
    { key: 'conversionRate', header: 'Conversion', align: 'right', render: (r) => p(r.conversionRate) },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => inr(r.revenue) },
    { key: 'medianHoursToCall', header: 'Time to call', align: 'right', render: (r) => hrs(r.medianHoursToCall) },
  ]
  const csv = () => downloadCsv(
    `${file}-${origin}`,
    [first, 'Leads', 'Called', 'Qualified', 'Not qualified', 'Bought', 'Conversion %', 'Revenue (₹)', 'Median hours to first call'],
    list.map((r) => [r.name, r.pushed, r.called, r.qualified, r.notQualified, r.converted, r.conversionRate ?? '', r.revenue, r.medianHoursToCall ?? '']),
  )
  return (
    <section className="nd-break">
      <div className="nd-break-head">
        <h3>{title}</h3>
        <button type="button" className="ad-btn ad-btn-quiet" disabled={!list.length} onClick={csv}>Download CSV</button>
      </div>
      <DataTable key={origin} rows={list} rowKey={(r) => r.name} columns={cols} initialSort={{ key: 'pushed', dir: 'desc' }}
        emptyTitle="No leads pushed in this period" emptyNote="Choose a longer period or the other source." />
    </section>
  )
}

function Trend({ days }) {
  const rows = [...days].reverse()
  return (
    <Card title="Day by day" subtitle="Newest first. Called = people NeoDove sent a call result for that day.">
      <div className="an-table-wrap nd-scroll">
        <table className="nd-compare nd-trend">
          <thead>
            <tr><th>Day</th><th>Sales Daddy: received</th><th>Sales Daddy: pushed</th><th>Our database: queued</th><th>Our database: pushed</th><th>Called</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.day}>
                <th scope="row">{new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</th>
                <td>{n(d.sdReceived)}</td><td>{n(d.sdPushed)}</td><td>{n(d.webQueued)}</td><td>{n(d.webPushed)}</td><td>{n(d.called)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
