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
  { id: 'api', label: 'Website API' },
  { id: 'jobs', label: 'Background jobs' },
  { id: 'deploys', label: 'Deploys' },
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
  return (
    <div className="cc-stack">
      <Alerts alerts={d.alerts} googleError={d.googleError} />
      <div className="cc-tiles">
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
    if (!data) return null
    if (tab === 'projects') return <Projects d={data} />
    if (tab === 'api') return <ApiTab d={data} />
    if (tab === 'jobs') return <JobsTab d={data} />
    if (tab === 'deploys') return <DeploysTab d={data} />
    return <Overview d={data} />
  }, [data, tab])

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
