import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import StaffGate from './StaffGate.jsx'
import { downloadCsv } from './AdvisorAnswer.jsx'
import './cloud.css'

/*
  /admin → Cloud Centre (Oct 2026, Phase 1): every Google Cloud and Firebase
  project of chennairiceindustries.com in one place: what each is for, its
  billing account, what runs in it, how much it is used, Firebase Hosting
  deploys, and the website's own API and background-job counters.
  Owner and IT only (/api/admin/cloud, read-only; backend/lib/sales/cloud.js).
*/

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'All projects' },
  { id: 'cost', label: 'Cost' },
  { id: 'speed', label: 'Speed' },
  { id: 'errors', label: 'Errors & uptime' },
  { id: 'security', label: 'Security' },
  { id: 'api', label: 'Website API' },
  { id: 'jobs', label: 'Background jobs' },
  { id: 'deploys', label: 'Deploys' },
  { id: 'settings', label: 'Alerts & settings' },
]
const PERIODS = [[1, 'Last 24 hours'], [7, 'Last 7 days'], [30, 'Last 30 days']]

const num = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-IN'))
const pct = (a, b) => (b ? (a / b) * 100 : 0)
const bytes = (b) => (!b ? '0 MB' : b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`)
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const ago = (iso) => {
  if (!iso) return '—'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
const share = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const host = (url) => url.replace(/^https:\/\//, '').replace(/\/$/, '')
// Google's Core Web Vitals bands: good / needs improvement / poor.
const band = (v, good, poor) => (v == null ? '' : v <= good ? 'good' : v <= poor ? 'warn' : 'bad')
const scoreBand = (s) => (s == null ? '' : s >= 90 ? 'good' : s >= 50 ? 'warn' : 'bad')

/** A row of thin bars, one per day. */
function Bars({ points, label }) {
  const max = Math.max(1, ...points.map((p) => p.value))
  if (!points.length) return <p className="cc-muted">No traffic in this period.</p>
  return (
    <div className="cc-bars" role="img" aria-label={label}>
      {points.map((p) => (
        <span key={p.day} title={`${p.day}: ${num(p.value)}`} style={{ height: `${Math.max(4, (p.value / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function Tile({ label, value, foot, tone }) {
  return (
    <div className={`cc-tile${tone ? ' is-' + tone : ''}`}>
      <span className="cc-tile-label">{label}</span>
      <strong>{value}</strong>
      {foot && <span className="cc-tile-foot">{foot}</span>}
    </div>
  )
}

function Alerts({ alerts, googleError }) {
  if (!alerts.length && !googleError) return <p className="cc-ok">● Everything looks healthy in this period.</p>
  return (
    <ul className="cc-alerts">
      {googleError && <li className="is-bad">{googleError}</li>}
      {alerts.map((a, i) => <li key={i} className={`is-${a.level}`}>{a.text}</li>)}
    </ul>
  )
}

function health(p, alerts) {
  const mine = alerts.filter((a) => a.project === p.id)
  if (mine.some((a) => a.level === 'bad')) return 'bad'
  if (mine.some((a) => a.level === 'warn')) return 'warn'
  return p.active ? 'good' : 'idle'
}

function ProjectCard({ p, alerts }) {
  const u = p.usage
  const lastDeploy = p.sites.flatMap((s) => s.releases).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]
  return (
    <article className="cc-card">
      <header className="cc-card-head">
        <span className={`cc-dot is-${health(p, alerts)}`} aria-hidden="true" />
        <div>
          <h3>{p.name}</h3>
          <span className="cc-mono">{p.id}</span>
        </div>
        <div className="cc-badges">
          {p.firebase && <span className="cc-badge is-fire">Firebase</span>}
          {p.billing && <span className="cc-badge">{p.billing.account}</span>}
        </div>
      </header>
      {p.purpose && <p className="cc-purpose">{p.purpose}</p>}
      {u && (
        <>
          <dl className="cc-stats">
            <div><dt>Requests</dt><dd>{num(u.requests)}</dd></div>
            <div><dt>Server errors</dt><dd className={pct(u.errors, u.requests) > 2 ? 'is-bad' : ''}>{num(u.errors)} <small>({pct(u.errors, u.requests).toFixed(1)}%)</small></dd></div>
            {u.hostingBytes > 0 && <div><dt>Hosting data</dt><dd>{bytes(u.hostingBytes)}</dd></div>}
            {u.firestore && <div><dt>Firestore reads / writes</dt><dd>{num(u.firestore.reads)} / {num(u.firestore.writes)}</dd></div>}
            {u.aiTokens > 0 && <div><dt>AI tokens</dt><dd>{num(u.aiTokens)}</dd></div>}
            {u.databases.map((d) => (
              <div key={d.id}><dt>Database {d.id.split(':').pop()}</dt><dd>CPU {share(d.cpu)} · disk {share(d.disk)}</dd></div>
            ))}
          </dl>
          <Bars points={u.requestsDaily} label={`Requests per day for ${p.id}`} />
        </>
      )}
      <footer className="cc-card-foot">
        {u?.services.length > 0 && <span>{u.services.map((s) => `${s.name} ${num(s.requests)}`).join(' · ')}</span>}
        {lastDeploy && <span>Last deploy {ago(lastDeploy.at)} by {lastDeploy.by || '—'}</span>}
      </footer>
    </article>
  )
}

function Overview({ d }) {
  const active = d.projects.filter((p) => p.usage)
  const lastDeploy = d.deploys[0]
  const apiCalls = d.api.daily.reduce((a, x) => a + x.calls, 0)
  const job = d.jobs.stats.find((s) => s.job === 'salesJobs')
  const checked = d.uptime.targets.filter((t) => t.lastOk != null)
  const sitesUp = checked.filter((t) => t.lastOk).length
  const errorKinds = active.reduce((a, p) => a + p.usage.errorGroups.length, 0)
  const errorTimes = active.reduce((a, p) => a + p.usage.errorGroups.reduce((s, g) => s + g.count, 0), 0)
  return (
    <div className="cc-stack">
      <Alerts alerts={d.alerts} googleError={d.googleError} />
      <div className="cc-tiles">
        <Tile label="Sites up now" value={checked.length ? `${sitesUp}/${checked.length}` : '—'} foot={checked.length ? 'checked every 10 minutes' : 'checks start once live'} tone={checked.length && sitesUp < checked.length ? 'bad' : ''} />
        <Tile label="Errors reported" value={num(errorTimes)} foot={`${errorKinds} kinds · see Errors & uptime`} tone={errorTimes ? 'warn' : ''} />
        <Tile label="Projects" value={num(d.totals.projects)} foot={`${d.totals.billed} billed · ${d.totals.firebase} Firebase`} />
        <Tile label="Requests (all projects)" value={num(d.totals.requests)} foot={`${pct(d.totals.errors, d.totals.requests).toFixed(2)}% server errors`} tone={pct(d.totals.errors, d.totals.requests) > 2 ? 'bad' : ''} />
        <Tile label="Hosting data served" value={bytes(d.totals.hostingBytes)} />
        <Tile label="Firestore reads" value={num(d.totals.firestoreReads)} />
        <Tile label="AI tokens (Gemini)" value={num(d.totals.aiTokens)} />
        <Tile label="Website API calls" value={num(apiCalls)} foot="counted by our server" />
        <Tile label="10-minute job" value={job ? `${job.runs - job.failed}/${job.runs} OK` : '—'} foot={job ? `last ${ago(job.last_run)}` : 'no runs recorded yet'} tone={job?.failed ? 'warn' : ''} />
        <Tile label="Last deploy" value={lastDeploy ? ago(lastDeploy.at) : '—'} foot={lastDeploy ? `${lastDeploy.site} · ${lastDeploy.by}` : ''} />
      </div>
      <div className="cc-cards">
        {active.map((p) => <ProjectCard key={p.id} p={p} alerts={d.alerts} />)}
      </div>
    </div>
  )
}

function Projects({ d }) {
  const groups = [
    ['Active (billed)', d.projects.filter((p) => p.state === 'ACTIVE' && p.active)],
    ['Not billed', d.projects.filter((p) => p.state === 'ACTIVE' && !p.active)],
    ['Being deleted (Google keeps them 30 days)', d.projects.filter((p) => p.state !== 'ACTIVE')],
  ]
  function csv() {
    downloadCsv('cloud-projects', ['Project', 'ID', 'State', 'Purpose', 'Billing account', 'Firebase', 'Resources', 'Requests', 'Server errors', 'Hosting MB'],
      d.projects.map((p) => [p.name, p.id, p.state, p.purpose, p.billing?.account || '', p.firebase ? 'yes' : '', p.resources.map((r) => `${r.type}: ${r.name}${r.state ? ` (${r.state})` : ''}`).join('; '),
        p.usage?.requests ?? '', p.usage?.errors ?? '', p.usage ? Math.round(p.usage.hostingBytes / 1e6) : '']))
  }
  return (
    <div className="cc-stack">
      <div className="cc-toolbar-end"><button type="button" className="cc-btn" onClick={csv}>⬇ Download CSV</button></div>
      {groups.map(([title, list]) => list.length > 0 && (
        <section key={title} className="cc-panel">
          <h3 className="cc-h3">{title} <small>{list.length}</small></h3>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Project</th><th>What it is for</th><th>Billing</th><th>What runs in it</th><th className="num">Requests</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><span className="cc-mono">{p.id}</span>{p.firebase && <span className="cc-badge is-fire">Firebase</span>}</td>
                    <td>{p.purpose || '—'}</td>
                    <td>{p.billing ? p.billing.account : <span className="cc-muted">none</span>}</td>
                    <td>
                      {p.resources.length ? (
                        <ul className="cc-res">
                          {p.resources.map((r) => <li key={r.type + r.name}><span>{r.type}</span> {r.name}{r.state && r.state !== 'ACTIVE' && r.state !== 'RUNNABLE' ? <b> {r.state}</b> : ''}</li>)}
                          {p.sites.map((s) => <li key={s.site}><span>Hosting site</span> <a href={s.url} target="_blank" rel="noopener noreferrer">{s.site}</a></li>)}
                        </ul>
                      ) : p.sites.length ? (
                        <ul className="cc-res">{p.sites.map((s) => <li key={s.site}><span>Hosting site</span> <a href={s.url} target="_blank" rel="noopener noreferrer">{s.site}</a></li>)}</ul>
                      ) : <span className="cc-muted">nothing</span>}
                    </td>
                    <td className="num">{p.usage ? num(p.usage.requests) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function ApiTab({ d }) {
  const a = d.api
  const calls = a.daily.reduce((s, x) => s + x.calls, 0)
  const errors = a.daily.reduce((s, x) => s + x.errors, 0)
  function csv() {
    downloadCsv(`website-api-${d.days}d`, ['Route', 'Method', 'Calls', 'Server errors', 'Rejected (4xx)', 'Average ms', 'Slowest ms'],
      a.routes.map((r) => [r.route, r.method, r.calls, r.errors, r.rejected, r.avg_ms, r.max_ms]))
  }
  return (
    <div className="cc-stack">
      <div className="cc-tiles">
        <Tile label="Calls" value={num(calls)} />
        <Tile label="Server errors" value={num(errors)} foot={`${pct(errors, calls).toFixed(2)}%`} tone={pct(errors, calls) > 2 ? 'bad' : ''} />
        <Tile label="Routes used" value={num(a.routes.length)} />
        <Tile label="Calls today" value={num(a.today.reduce((s, x) => s + x.calls, 0))} />
      </div>
      <section className="cc-panel">
        <h3 className="cc-h3">Calls per day</h3>
        <Bars points={a.daily.map((x) => ({ day: x.day, value: x.calls }))} label="Website API calls per day" />
      </section>
      <section className="cc-panel">
        <div className="cc-panel-head"><h3 className="cc-h3">Calls per route</h3><button type="button" className="cc-btn" onClick={csv} disabled={!a.routes.length}>⬇ Download CSV</button></div>
        {a.routes.length ? (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Route</th><th>Method</th><th className="num">Calls</th><th className="num">Server errors</th><th className="num">Rejected</th><th className="num">Avg</th><th className="num">Slowest</th></tr></thead>
              <tbody>
                {a.routes.map((r) => (
                  <tr key={r.method + r.route}>
                    <td className="cc-mono">{r.route}</td><td>{r.method}</td><td className="num">{num(r.calls)}</td>
                    <td className={`num${r.errors ? ' is-bad' : ''}`}>{num(r.errors)}</td><td className="num">{num(r.rejected)}</td>
                    <td className="num">{num(r.avg_ms)} ms</td><td className="num">{num(r.max_ms)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="cc-muted">No calls counted yet. Counting starts once this update is live.</p>}
      </section>
    </div>
  )
}

/** "email 3 sent · crm 1 sent": the non-zero numbers in a job's summary. */
function summary(result) {
  if (!result || typeof result !== 'object') return ''
  const parts = []
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'number' && v) parts.push(`${k} ${v}`)
    else if (v && typeof v === 'object') {
      if (v.error) parts.push(`${k}: ${v.error}`)
      const inner = Object.entries(v).filter(([, x]) => typeof x === 'number' && x).map(([x, n]) => `${n} ${x}`)
      if (inner.length) parts.push(`${k} ${inner.join(', ')}`)
    }
  }
  return parts.join(' · ')
}

function JobsTab({ d }) {
  const j = d.jobs
  return (
    <div className="cc-stack">
      <div className="cc-tiles">
        {j.stats.length ? j.stats.map((s) => (
          <Tile key={s.job} label={s.job} value={`${s.runs - s.failed}/${s.runs} OK`} foot={`avg ${(s.avg_ms / 1000).toFixed(1)} s · slowest ${(s.max_ms / 1000).toFixed(1)} s · last ${ago(s.last_run)}`} tone={s.failed ? 'warn' : ''} />
        )) : <Tile label="salesJobs" value="—" foot="No runs recorded yet. Recording starts once this update is live." />}
      </div>
      <section className="cc-panel">
        <h3 className="cc-h3">Latest runs</h3>
        <ul className="cc-runs">
          {j.runs.map((r) => (
            <li key={r.id}>
              <span className={`cc-dot is-${r.ok ? 'good' : 'bad'}`} aria-hidden="true" />
              <span className="cc-run-when">{when(r.started_at)}</span>
              <span className="cc-muted">{(r.ms / 1000).toFixed(1)} s</span>
              <span className={r.ok ? '' : 'is-bad'}>{r.ok ? summary(r.result) || 'Nothing to do' : r.error}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function DeploysTab({ d }) {
  function csv() {
    downloadCsv('cloud-deploys', ['When', 'Project', 'Site', 'By', 'Type', 'Files', 'Message'],
      d.deploys.map((x) => [when(x.at), x.project, x.site, x.by, x.type, x.files ?? '', x.message]))
  }
  return (
    <section className="cc-panel">
      <div className="cc-panel-head"><h3 className="cc-h3">Firebase Hosting deploys, newest first</h3><button type="button" className="cc-btn" onClick={csv} disabled={!d.deploys.length}>⬇ Download CSV</button></div>
      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead><tr><th>When</th><th>Site</th><th>By</th><th>Type</th><th className="num">Files</th></tr></thead>
          <tbody>
            {d.deploys.map((x, i) => (
              <tr key={i}>
                <td>{when(x.at)} <span className="cc-muted">({ago(x.at)})</span></td>
                <td><a href={x.url} target="_blank" rel="noopener noreferrer">{x.site}</a>{x.project !== x.site && <span className="cc-mono">{x.project}</span>}</td>
                <td>{x.by || '—'}</td><td>{x.type === 'DEPLOY' ? 'Deploy' : x.type === 'ROLLBACK' ? 'Rollback' : x.type}</td>
                <td className="num">{x.files ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Loads one of the slower Cloud Centre pages (cost, security) on its own. */
function useCloudPart(path, onAuthError) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await staffJson(path))
    } catch (err) {
      if (!onAuthError(err)) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [path, onAuthError])
  useEffect(() => { load() }, [load])
  return { data, error, loading }
}

function Budgets({ list, currency }) {
  if (!list?.length) return <p className="cc-muted">No budgets set on the billing accounts.</p>
  return (
    <ul className="cc-budgets">
      {list.map((b) => {
        const share = b.share == null ? null : b.share
        const tone = share == null ? '' : share >= 1 ? 'bad' : share >= 0.9 ? 'warn' : 'good'
        return (
          <li key={b.accountId + b.name}>
            <div className="cc-budget-head">
              <strong>{b.name}</strong>
              <span className="cc-muted">{b.account}{b.projects.length ? ` · ${b.projects.join(', ')}` : ' · whole account'}</span>
            </div>
            <div className="cc-budget-bar"><span className={tone ? `is-${tone}` : ''} style={{ width: `${Math.min(100, (share || 0) * 100)}%` }} /></div>
            <span className="cc-muted">
              {b.spent == null ? 'Spend appears once the billing data arrives' : `${money(b.spent, currency)} spent this month`} of {money(b.amount, b.currency)}
              {share != null && ` (${Math.round(share * 100)}%)`}{b.thresholds.length ? ` · alerts at ${b.thresholds.join(', ')}%` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const money = (v, currency = 'INR') => (v == null ? '—' : `${currency === 'INR' ? '₹' : currency + ' '}${Number(v).toLocaleString('en-IN', { maximumFractionDigits: v < 100 ? 2 : 0 })}`)

function CostTab({ days, onAuthError }) {
  const { data: c, error, loading } = useCloudPart(`/api/admin/cloud/costs?days=${days === 1 ? 7 : days}`, onAuthError)
  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!c) return <p className="cc-muted">{loading ? 'Reading the billing data…' : ''}</p>
  if (!c.ready) {
    return (
      <div className="cc-stack">
        <p className="cc-alerts-one">{c.error || c.note}</p>
        <section className="cc-panel"><h3 className="cc-h3">Budgets</h3><Budgets list={c.budgets} /></section>
      </div>
    )
  }
  const cur = c.currency
  const change = c.previous ? ((c.total - c.previous) / c.previous) * 100 : null
  function csv() {
    downloadCsv(`cloud-cost-${c.from}-to-${c.to}`, ['Project', `Cost (${cur})`], c.byProject.map((p) => [p.name, p.cost]))
  }
  const List = ({ title, rows }) => {
    const max = Math.max(1, ...rows.map((r) => r.cost))
    return (
      <section className="cc-panel">
        <h3 className="cc-h3">{title}</h3>
        <ul className="cc-costlist">
          {rows.map((r) => (
            <li key={r.name}><span className="cc-costlist-name">{r.name}</span><span className="cc-costlist-bar"><span style={{ width: `${Math.max(1, (r.cost / max) * 100)}%` }} /></span><strong>{money(r.cost, cur)}</strong></li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <div className="cc-stack">
      <div className="cc-tiles">
        <Tile label={`Cost, ${c.from} to ${c.to}`} value={money(c.total, cur)} foot={change == null ? 'no earlier period to compare' : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(0)}% vs the ${c.days} days before`} tone={change > 25 ? 'warn' : ''} />
        <Tile label="This month so far" value={money(c.monthToDate, cur)} foot={`forecast for the month ${money(c.forecast, cur)}`} />
        <Tile label="Last month" value={money(c.lastMonth, cur)} />
        <Tile label="Credits (free tier, offers)" value={money(c.credits, cur)} />
        <Tile label="Website cost per paid order" value={money(c.website.perOrder, cur)} foot={`${money(c.website.cost, cur)} ÷ ${num(c.website.paidOrders)} orders`} />
      </div>
      <section className="cc-panel">
        <div className="cc-panel-head"><h3 className="cc-h3">Cost per day</h3><button type="button" className="cc-btn" onClick={csv}>⬇ Download CSV</button></div>
        <Bars points={c.daily} label="Cloud cost per day" />
      </section>
      <section className="cc-panel"><h3 className="cc-h3">Budgets (this month)</h3><Budgets list={c.budgets} currency={cur} /></section>
      <div className="cc-two">
        <List title="By project" rows={c.byProject} />
        <List title="By service" rows={c.byService} />
      </div>
      <List title="Top cost items" rows={c.topItems} />
      {c.resources.length > 0 && (
        <section className="cc-panel">
          <h3 className="cc-h3">Most expensive resources, last 30 days</h3>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Resource</th><th>Service</th><th>Project</th><th className="num">Cost</th></tr></thead>
              <tbody>{c.resources.map((r) => <tr key={r.project + r.resource}><td className="cc-mono">{r.resource}</td><td>{r.service}</td><td>{r.project}</td><td className="num">{money(r.net, cur)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      <p className="cc-foot">Google's billing export, refreshed hourly here (Google updates it several times a day) · read {when(c.fetchedAt)}{days === 1 ? ' · the cost tab shows at least 7 days' : ''}</p>
    </div>
  )
}

function SecurityTab({ onAuthError }) {
  const { data: s, error, loading } = useCloudPart('/api/admin/cloud/security', onAuthError)
  if (error) return <p className="ad-alert" role="alert">{error}</p>
  if (!s) return <p className="cc-muted">{loading ? 'Checking access across the organisation…' : ''}</p>
  const missing = Object.entries(s.complete).filter(([, ok]) => !ok).map(([k]) => k)
  return (
    <div className="cc-stack">
      {missing.length > 0 && <p className="cc-alerts-one">Could not read: {missing.join(', ')}. The server account may be missing a viewer role.</p>}
      {s.findings.length ? (
        <ul className="cc-alerts">{s.findings.map((f, i) => <li key={i} className={`is-${f.level}`}>{f.text}</li>)}</ul>
      ) : <p className="cc-ok">● No security problems found.</p>}
      <div className="cc-tiles">
        <Tile label="People and accounts with Owner / Editor" value={num(s.access.length)} foot={`${s.access.filter((a) => a.outside).length} outside the company`} tone={s.access.some((a) => a.outside) ? 'bad' : ''} />
        <Tile label="Open to the internet" value={num(s.open.length)} foot={`${s.open.filter((o) => o.risk === 'check').length} to check`} tone={s.open.some((o) => o.risk === 'check') ? 'bad' : ''} />
        <Tile label="Downloadable keys" value={num(s.keys.length)} foot={s.keys.length ? `oldest ${s.keys[0].ageDays} days` : 'none: good'} tone={s.keys.some((k) => k.ageDays > 90) ? 'warn' : ''} />
        <Tile label="Service accounts" value={num(s.serviceAccounts)} />
      </div>
      <section className="cc-panel">
        <h3 className="cc-h3">Who has full control (Owner or Editor)</h3>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Account</th><th>Role</th><th>Where</th><th>Note</th></tr></thead>
            <tbody>
              {s.access.map((a, i) => (
                <tr key={i}><td className={a.outside ? 'is-bad' : ''}>{a.member}<span className="cc-mono">{a.type === 'serviceAccount' ? 'service account' : a.type}</span></td><td>{a.role}</td><td>{a.where}</td><td className={a.outside ? 'is-bad' : 'cc-muted'}>{a.note || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cc-panel">
        <h3 className="cc-h3">Open to everyone on the internet</h3>
        {s.open.length ? (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>What</th><th>Project</th><th>Access</th><th>Verdict</th></tr></thead>
              <tbody>
                {s.open.map((o, i) => (
                  <tr key={i}><td><strong>{o.name}</strong><span className="cc-mono">{o.kind}</span></td><td>{o.project}</td><td className="cc-mono">{o.roles.join(', ')}</td>
                    <td className={o.risk === 'check' ? 'is-bad' : 'cc-muted'}>{o.risk === 'check' ? 'Check: should this be public?' : 'Expected: a public website or API'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="cc-muted">Nothing is open to everyone.</p>}
      </section>
      {s.keys.length > 0 && (
        <section className="cc-panel">
          <h3 className="cc-h3">Downloadable service-account keys</h3>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Service account</th><th>Project</th><th>Created</th><th className="num">Age</th></tr></thead>
              <tbody>{s.keys.map((k, i) => <tr key={i}><td className="cc-mono">{k.account}</td><td>{k.project}</td><td>{when(k.created)}</td><td className={`num${k.ageDays > 90 ? ' is-bad' : ''}`}>{k.ageDays} days</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      <p className="cc-foot">Google Cloud Asset Inventory across the organisation, checked {when(s.checkedAt)} (every 30 minutes) · read-only</p>
    </div>
  )
}

/** "Check now": runs an uptime round or the next PageSpeed check, then reloads the page's figures. */
function CheckNow({ kind, label, reload, onAuthError }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  async function run() {
    setBusy(true)
    setNote('')
    try {
      const r = await staffJson('/api/admin/cloud/check', { method: 'POST', body: JSON.stringify({ kind }) })
      setNote(r.skipped ? `Not run: ${r.skipped}.` : r.error ? `Checked, with an error: ${r.error}` : 'Done.')
      reload()
    } catch (err) {
      if (!onAuthError(err)) setNote(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="cc-checknow">
      <button type="button" className="cc-btn" onClick={run} disabled={busy}>{busy ? 'Checking…' : label}</button>
      {note && <span className="cc-muted">{note}</span>}
    </span>
  )
}

function SpeedTab({ d, reload, onAuthError }) {
  const services = d.projects.filter((p) => p.usage).flatMap((p) => p.usage.services.map((s) => ({ ...s, project: p.id })))
  const db = d.database
  const Cell = ({ r }) => {
    if (!r) return <td className="cc-muted">not checked yet</td>
    if (r.error) return <td className="is-bad">{r.error}</td>
    return (
      <td>
        <span className={`cc-score is-${scoreBand(r.score)}`}>{r.score ?? '—'}</span>
        <span className="cc-muted"> lab: load {ms(r.lab_lcp_ms)} · blocking {ms(r.lab_tbt_ms)}</span>
        {r.field_category ? (
          <span className="cc-field">
            Real users: <b className={`is-${band(r.field_lcp_ms, 2500, 4000)}`}>load {ms(r.field_lcp_ms)}</b> · <b className={`is-${band(r.field_inp_ms, 200, 500)}`}>tap {ms(r.field_inp_ms)}</b> · <b className={`is-${band(r.field_cls, 0.1, 0.25)}`}>shift {r.field_cls ?? '—'}</b>
          </span>
        ) : <span className="cc-field cc-muted">Not enough Chrome visits yet for real-user figures.</span>}
        <span className="cc-muted"> · {ago(r.checked_at)}</span>
      </td>
    )
  }
  return (
    <div className="cc-stack">
      <section className="cc-panel">
        <div className="cc-panel-head">
          <h3 className="cc-h3">Website speed (Google PageSpeed, checked every night)</h3>
          <CheckNow kind="speed" label="Check next page now" reload={reload} onAuthError={onAuthError} />
        </div>
        <p className="cc-muted">Score out of 100 (90+ good, 50–89 needs work, under 50 poor). Real users = Chrome visitors over the last 28 days: load under 2.5 s, tap response under 200 ms and layout shift under 0.1 are good.</p>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Page</th><th>Phone</th><th>Computer</th></tr></thead>
            <tbody>
              {d.speed.map((p) => (
                <tr key={p.url}><td><a href={p.url} target="_blank" rel="noopener noreferrer">{host(p.url)}</a></td><Cell r={p.mobile} /><Cell r={p.desktop} /></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="cc-panel">
        <h3 className="cc-h3">How fast each server answers</h3>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Service</th><th className="num">Requests</th><th className="num">Typical (median)</th><th className="num">Slowest 5%</th><th className="num">Cold starts</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.project + s.name}>
                  <td><strong>{s.name}</strong><span className="cc-mono">{s.project}</span></td>
                  <td className="num">{num(s.requests)}</td>
                  <td className="num">{ms(s.p50Ms)}</td>
                  <td className={`num${s.p95Ms > 2000 ? ' is-bad' : ''}`}>{ms(s.p95Ms)}</td>
                  <td className="num">{num(s.coldStarts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cc-muted">A cold start is a server waking up after being idle (about 2–3 s extra for that one request).</p>
      </section>
      <section className="cc-panel">
        <h3 className="cc-h3">Website database</h3>
        <div className="cc-tiles cc-tiles-3">
          <Tile label="Database size" value={bytes(db.bytes)} />
          <Tile label="Connections" value={num(db.connections.reduce((a, c) => a + c.n, 0))} foot={db.connections.map((c) => `${c.n} ${c.state}`).join(' · ')} />
          <Tile label="Query statistics" value={db.queryStats ? 'On' : 'Off'} foot={db.queryStats ? 'slowest queries below' : 'Turn on the Cloud SQL flag cloudsql.enable_pg_stat_statements to see slow queries'} />
        </div>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Biggest tables</th><th className="num">Rows</th><th className="num">Size</th></tr></thead>
            <tbody>{db.tables.map((t) => <tr key={t.name}><td className="cc-mono">{t.name}</td><td className="num">{num(t.rows)}</td><td className="num">{bytes(t.bytes)}</td></tr>)}</tbody>
          </table>
        </div>
        {db.slowQueries?.length > 0 && (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Slowest queries (total time)</th><th className="num">Calls</th><th className="num">Average</th></tr></thead>
              <tbody>{db.slowQueries.map((s, i) => <tr key={i}><td className="cc-mono">{s.query}</td><td className="num">{num(s.calls)}</td><td className="num">{ms(Number(s.mean_ms))}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ErrorsTab({ d, reload, onAuthError }) {
  const groups = d.projects.filter((p) => p.usage).flatMap((p) => p.usage.errorGroups.map((g) => ({ ...g, project: p.id })))
    .sort((a, b) => b.count - a.count)
  return (
    <div className="cc-stack">
      <section className="cc-panel">
        <div className="cc-panel-head">
          <h3 className="cc-h3">Uptime: every site checked every 10 minutes</h3>
          <CheckNow kind="uptime" label="Check all now" reload={reload} onAuthError={onAuthError} />
        </div>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Site</th><th>Now</th><th className="num">Uptime</th><th className="num">Checks</th><th className="num">Average answer</th></tr></thead>
            <tbody>
              {d.uptime.targets.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.label}</strong><a className="cc-mono" href={t.url} target="_blank" rel="noopener noreferrer">{host(t.url)}</a></td>
                  <td>{t.lastOk == null ? <span className="cc-muted">no checks yet</span> : (
                    <span className={t.lastOk ? 'cc-up' : 'cc-down'}><span className={`cc-dot is-${t.lastOk ? 'good' : 'bad'}`} aria-hidden="true" /> {t.lastOk ? 'Up' : `Down (${t.lastResult})`} · {ago(t.lastAt)}</span>
                  )}</td>
                  <td className={`num${t.uptime != null && t.uptime < 0.99 ? ' is-bad' : ''}`}>{t.uptime == null ? '—' : `${(t.uptime * 100).toFixed(2)}%`}</td>
                  <td className="num">{num(t.checks)}</td>
                  <td className="num">{ms(t.avgMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.uptime.failures.length > 0 && (
          <details className="cc-details">
            <summary>{d.uptime.failures.length} failed checks in this period</summary>
            <ul className="cc-runs">
              {d.uptime.failures.map((f, i) => (
                <li key={i}><span className="cc-dot is-bad" aria-hidden="true" /><span className="cc-run-when">{when(f.checked_at)}</span><span>{f.target}</span><span className="is-bad">{f.error || `HTTP ${f.status}`}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section className="cc-panel">
        <h3 className="cc-h3">Errors by kind, all projects (Google Error Reporting)</h3>
        {groups.length ? (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th className="num">Times</th><th>Error</th><th>Where</th><th>Last seen</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.project + g.id}>
                    <td className="num"><strong>{num(g.count)}</strong></td>
                    <td className="cc-errmsg">{g.message}</td>
                    <td><strong>{g.service || '—'}</strong><span className="cc-mono">{g.project}</span></td>
                    <td>{ago(g.lastSeen)}<span className="cc-muted"> · first {when(g.firstSeen)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="cc-ok">● No errors reported in this period.</p>}
      </section>
      <section className="cc-panel">
        <h3 className="cc-h3">What the website sends out</h3>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>To</th><th className="num">Sent</th><th className="num">Failed</th><th className="num">Waiting now</th><th>Oldest waiting</th></tr></thead>
            <tbody>
              {d.deliveries.map((x) => (
                <tr key={x.name}>
                  <td><strong>{x.name}</strong></td><td className="num">{num(x.sent)}</td>
                  <td className={`num${x.failed ? ' is-bad' : ''}`}>{num(x.failed)}</td><td className="num">{num(x.waiting)}</td>
                  <td>{x.oldest_waiting ? `${when(x.oldest_waiting)} (${ago(x.oldest_waiting)})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function SettingsTab({ onAuthError }) {
  const [s, setS] = useState(null)
  const [emails, setEmails] = useState('')
  const [key, setKey] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    staffJson('/api/admin/cloud/settings').then((r) => { setS(r); setEmails(r.alertEmails.join(', ')) }).catch((err) => { if (!onAuthError(err)) setNote(err.message) })
  }, [onAuthError])
  async function save(body) {
    setBusy(true)
    setNote('')
    try {
      const r = await staffJson('/api/admin/cloud/settings', { method: 'PUT', body: JSON.stringify(body) })
      setS(r)
      setEmails(r.alertEmails.join(', '))
      setKey('')
      setNote('Saved.')
    } catch (err) {
      if (!onAuthError(err)) setNote(err.message)
    } finally {
      setBusy(false)
    }
  }
  if (!s) return <p className="cc-muted">{note || 'Loading…'}</p>
  return (
    <div className="cc-stack">
      <section className="cc-panel cc-form">
        <h3 className="cc-h3">Alert emails</h3>
        <p className="cc-muted">Sent when a site is down in two checks in a row, the 10-minute job fails three times, or the website API's server errors pass 5% in an hour. The same problem is emailed at most once every 6 hours.</p>
        <label>
          <span>Send alerts to (comma-separated)</span>
          <input type="text" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="it@chennairiceindustries.com" />
        </label>
        <p className="cc-muted">{s.recipients ? `Alerts go to: ${s.recipients}` : 'Nobody gets alerts yet: add an email, or give a staff account the IT role.'}{!s.alertEmails.length && s.recipients ? ' (the IT team accounts, until a list is saved here)' : ''}</p>
        <button type="button" className="cc-btn cc-btn-main" onClick={() => save({ alertEmails: emails })} disabled={busy}>Save alert emails</button>
      </section>
      <section className="cc-panel cc-form">
        <h3 className="cc-h3">PageSpeed API key</h3>
        <p className="cc-muted">The nightly website-speed checks need a free Google API key: Google Cloud console → project <b>chennai-rice-website</b> → APIs &amp; Services → enable <b>PageSpeed Insights API</b> → Credentials → Create API key → restrict it to the PageSpeed Insights API. The key is stored on the server and never shown again.</p>
        <p className={s.pagespeedKeySet ? 'cc-up' : 'cc-muted'}>{s.pagespeedKeySet ? '● A key is saved.' : 'No key saved yet.'}</p>
        <label>
          <span>{s.pagespeedKeySet ? 'Replace the key' : 'Paste the key'}</span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" />
        </label>
        <div className="cc-row">
          <button type="button" className="cc-btn cc-btn-main" onClick={() => save({ pagespeedKey: key })} disabled={busy || !key.trim()}>Save key</button>
          {s.pagespeedKeySet && <button type="button" className="cc-btn" onClick={() => save({ pagespeedKey: '' })} disabled={busy}>Remove key</button>}
        </div>
      </section>
      {note && <p className="cc-muted" role="status">{note}</p>}
    </div>
  )
}

function Centre({ onAuthError }) {
  const [days, setDays] = useState(7)
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await staffJson('/api/admin/cloud?days=' + days))
    } catch (err) {
      if (!onAuthError(err)) setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days, onAuthError])
  useEffect(() => { load() }, [load])

  const body = useMemo(() => {
    if (tab === 'settings') return <SettingsTab onAuthError={onAuthError} />
    if (tab === 'cost') return <CostTab days={days} onAuthError={onAuthError} />
    if (tab === 'security') return <SecurityTab onAuthError={onAuthError} />
    if (!data) return null
    if (tab === 'projects') return <Projects d={data} />
    if (tab === 'speed') return <SpeedTab d={data} reload={load} onAuthError={onAuthError} />
    if (tab === 'errors') return <ErrorsTab d={data} reload={load} onAuthError={onAuthError} />
    if (tab === 'api') return <ApiTab d={data} />
    if (tab === 'jobs') return <JobsTab d={data} />
    if (tab === 'deploys') return <DeploysTab d={data} />
    return <Overview d={data} />
  }, [data, tab, days, load, onAuthError])

  return (
    <div className="cc">
      <div className="cc-toolbar">
        <div className="cc-seg" role="tablist" aria-label="Cloud Centre sections">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        <div className="cc-seg" role="group" aria-label="Period">
          {PERIODS.map(([d, label]) => <button key={d} type="button" className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>{label}</button>)}
          <button type="button" className="cc-btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
        </div>
      </div>
      {error && <p className="ad-alert" role="alert">{error}</p>}
      {!data && loading && <p className="cc-muted">Reading every project from Google Cloud… (about 5 seconds)</p>}
      {body}
      {data?.fetchedAt && <p className="cc-foot">Google Cloud figures read {when(data.fetchedAt)} (refreshed every 10 minutes) · Read-only access</p>}
    </div>
  )
}

export default function CloudCentrePanel() {
  return (
    <StaffGate
      perm="cloud.view"
      title="Sign in to see the Cloud Centre"
      why="The Cloud Centre shows every Google Cloud and Firebase project, so it needs your staff Google account (owner or IT team)."
      deniedText="This staff account cannot open the Cloud Centre. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Centre onAuthError={onAuthError} />}
    </StaffGate>
  )
}
