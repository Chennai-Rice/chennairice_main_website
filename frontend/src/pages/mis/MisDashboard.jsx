import { useCallback, useEffect, useMemo, useState } from 'react'
import { signOutStaff, staffJson } from '../../services/staffAuth.js'
import { STATUSES, STATUS_COLOR, applyFilters, countBy, downloadCsv, groupTable, monthLabel, pct, summarise } from './aggregate.js'
import './mis.css'

/**
 * The MIS dashboard (Nov 2026): the leads of the MIS Google Sheet as an overview, brands, leads, telecallers and
 * reports. The numbers come from the sheet through the website's server (backend/lib/sales/mis.js); the sheet stays
 * the place where leads are edited. `standalone` is the MIS login's own screen (with sign-out); otherwise it sits
 * inside /admin for the owner and the IT team.
 */
const NAV = [
  ['overview', '📊', 'Overview'],
  ['brands', '🏷️', 'Brands'],
  ['leads', '📋', 'Leads'],
  ['telecallers', '📞', 'Telecallers'],
  ['reports', '🗂️', 'Reports'],
]
const BAR_COLORS = ['#b9a6ee', '#f2a2c3', '#f7c79b', '#9fd8ef', '#a8e0c2', '#f4d98a']
const PAGE = 50
const REFRESH_MS = 5 * 60_000

const when = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '')

function loadTheme() {
  try {
    return localStorage.getItem('cr.mis.theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export default function MisDashboard({ standalone = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('overview')
  const [filters, setFilters] = useState({ brand: '', platform: '', month: '' })
  const [theme, setTheme] = useState(loadTheme)
  const [search, setSearch] = useState('')
  const [statusOnly, setStatusOnly] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    try {
      setData(await staffJson('/api/admin/mis/data' + (refresh ? '?refresh=1' : '')))
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load the sheet.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
    const t = window.setInterval(() => load(false), REFRESH_MS)
    return () => window.clearInterval(t)
  }, [load])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem('cr.mis.theme', next)
    } catch {
      /* private mode: the choice lasts until reload */
    }
  }

  const rows = data?.rows || []
  const options = useMemo(() => {
    const uniq = (key) => [...new Set(rows.map((r) => r[key]))].sort((a, b) => String(a).localeCompare(String(b)))
    const months = [...new Set(rows.map((r) => r.month).filter(Boolean))].sort().reverse()
    return { brands: uniq('brand'), platforms: uniq('platform'), months, hasNoDate: rows.some((r) => !r.month) }
  }, [rows])

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters])
  const sum = useMemo(() => summarise(filtered), [filtered])
  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const title = NAV.find(([id]) => id === view)?.[2] || 'Overview'

  return (
    <div className={`mis mis-${theme}${standalone ? ' is-standalone' : ''}`}>
      <aside className="mis-side">
        <div className="mis-brand">
          <img src="/assets/logo-full-v2.png" alt="" width="46" height="46" />
          <div>
            <strong>Chennai Rice Industries</strong>
            <span>Leads Dashboard</span>
          </div>
        </div>
        <nav className="mis-nav" aria-label="Dashboard sections">
          {NAV.map(([id, icon, label]) => (
            <button key={id} type="button" className={id === view ? 'is-active' : ''} aria-current={id === view ? 'page' : undefined} onClick={() => setView(id)}>
              <span aria-hidden="true">{icon}</span> {label}
            </button>
          ))}
        </nav>
        <div className="mis-side-foot">
          <p className="mis-sync">
            <span className={`mis-dot${error ? ' is-bad' : ''}`} aria-hidden="true" />
            {error ? 'Sheet not loaded' : data ? `Live from Google Sheet · updated ${when(data.fetchedAt)}` : 'Reading the sheet…'}
          </p>
          <button type="button" className="mis-btn" disabled={loading} onClick={() => load(true)}>{loading ? 'Reading…' : '↻ Refresh now'}</button>
          <button type="button" className="mis-btn" onClick={toggleTheme}>{theme === 'dark' ? '☀ Light' : '🌙 Dark'}</button>
          {standalone && (
            <button type="button" className="mis-btn" onClick={async () => { await signOutStaff(); window.location.reload() }}>Sign out</button>
          )}
        </div>
      </aside>

      <main className="mis-main">
        <header className="mis-head">
          <h1>{title}</h1>
          {data && view !== 'reports' && (
            <div className="mis-filters">
              <select aria-label="Brand" value={filters.brand} onChange={(e) => set({ brand: e.target.value })}>
                <option value="">All brands</option>
                {options.brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select aria-label="Platform" value={filters.platform} onChange={(e) => set({ platform: e.target.value })}>
                <option value="">All platforms</option>
                {options.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select aria-label="Month" value={filters.month} onChange={(e) => set({ month: e.target.value })}>
                <option value="">All months</option>
                {options.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                {options.hasNoDate && <option value="none">No date</option>}
              </select>
            </div>
          )}
        </header>

        {error && (
          <div className="mis-alert" role="alert">
            <p>{error}</p>
            <button type="button" className="mis-btn" onClick={() => load(true)}>Try again</button>
          </div>
        )}
        {!data && !error && <p className="mis-muted">Reading the Google Sheet…</p>}

        {data && <DataNotes data={data} />}

        {data && view === 'overview' && <Overview rows={filtered} sum={sum} />}
        {data && view === 'brands' && <GroupView rows={filtered} field="brand" label="Brand" />}
        {data && view === 'telecallers' && <GroupView rows={filtered} field="telecaller" label="Telecaller" />}
        {data && view === 'leads' && (
          <Leads rows={filtered} search={search} setSearch={(v) => { setSearch(v); setPage(1) }} statusOnly={statusOnly}
            setStatusOnly={(v) => { setStatusOnly(v); setPage(1) }} page={page} setPage={setPage} />
        )}
        {data && view === 'reports' && <Reports rows={rows} filtered={filtered} filters={filters} set={set} options={options} />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------ small parts */

/** What the server found in the sheet: columns it could not match and status words it did not recognise. */
function DataNotes({ data }) {
  const [open, setOpen] = useState(false)
  const important = ['brand', 'status', 'platform'].filter((f) => data.missing.includes(f))
  const notes = important.length || data.unmappedStatuses.length
  return (
    <section className="mis-notes">
      {notes ? (
        <p className="mis-warn">
          {important.length > 0 && <>Columns not found in the sheet: <strong>{important.join(', ')}</strong>. </>}
          {data.unmappedStatuses.length > 0 && (
            <>Status words counted as Open / Pending because they were not recognised: {data.unmappedStatuses.map((u) => `“${u.value}” (${u.count})`).join(', ')}. </>
          )}
        </p>
      ) : null}
      <button type="button" className="mis-link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'About this data'}</button>
      {open && (
        <div className="mis-about">
          <p>Sheet tab: <strong>{data.sheetTitle || 'MIS sheet'}</strong> · {data.rows.length} leads read · dates read for {data.datesRead}</p>
          <p>Columns used: {Object.entries(data.mapping).map(([field, col]) => `${field} ← “${col}”`).join(' · ') || 'none'}</p>
          {data.missing.length > 0 && <p>Not in the sheet: {data.missing.join(', ')}</p>}
        </div>
      )}
    </section>
  )
}

function Metric({ tone, label, value }) {
  return (
    <div className={`mis-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Bars({ items, total, showPct = false }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  if (!items.length) return <p className="mis-muted">No leads for this selection.</p>
  return (
    <ul className="mis-bars">
      {items.map((it, n) => (
        <li key={it.label}>
          <div className="mis-bar-row">
            <span>{it.label}</span>
            <span>{showPct ? `${it.count} · ${pct(it.count, total)}%` : it.count}</span>
          </div>
          <div className="mis-bar-track"><div className="mis-bar" style={{ width: `${(it.count / max) * 100}%`, background: BAR_COLORS[n % BAR_COLORS.length] }} /></div>
        </li>
      ))}
    </ul>
  )
}

function Donut({ parts, total }) {
  const R = 64
  const C = 2 * Math.PI * R
  let used = 0
  return (
    <svg viewBox="0 0 180 180" className="mis-donut" role="img" aria-label="Lead status">
      <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(150,140,180,0.16)" strokeWidth="28" />
      {parts.filter((p) => p.count > 0).map((p) => {
        const len = (p.count / total) * C
        const el = (
          <circle key={p.label} cx="90" cy="90" r={R} fill="none" stroke={STATUS_COLOR[p.label]} strokeWidth="28"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-used} transform="rotate(-90 90 90)" />
        )
        used += len
        return el
      })}
      <text x="90" y="88" textAnchor="middle" className="mis-donut-n">{total}</text>
      <text x="90" y="108" textAnchor="middle" className="mis-donut-l">leads</text>
    </svg>
  )
}

const Chip = ({ status }) => <span className="mis-chip" style={{ background: STATUS_COLOR[status] }}>{status}</span>

/* ---------------------------------------------------------------- screens */

function Overview({ rows, sum }) {
  const status = STATUSES.map((s) => ({ label: s, count: rows.filter((r) => r.status === s).length }))
  return (
    <>
      <div className="mis-metrics">
        <Metric tone="pink" label="Total leads" value={sum.total} />
        <Metric tone="green" label="Positively closed" value={sum.positive} />
        <Metric tone="red" label="Negatively closed" value={sum.negative} />
        <Metric tone="blue" label="In Process" value={sum.inProcess} />
        <Metric tone="yellow" label="Open / Pending" value={sum.open} />
        <Metric tone="lilac" label="Conversion" value={`${sum.conversion.toFixed(1)}%`} />
        <Metric tone="cyan" label="Enquiries" value={sum.enquiries} />
        <Metric tone="peach" label="Complaints" value={sum.complaints} />
      </div>

      <div className="mis-two">
        <section className="mis-panel">
          <h2>Leads by stage</h2>
          <Bars items={countBy(rows, 'stage')} total={sum.total} showPct />
        </section>
        <section className="mis-panel">
          <h2>Lead status</h2>
          <div className="mis-status">
            {sum.total > 0 ? <Donut parts={status} total={sum.total} /> : <p className="mis-muted">No leads for this selection.</p>}
            <ul className="mis-legend">
              {status.map((s) => (
                <li key={s.label}><i style={{ background: STATUS_COLOR[s.label] }} />{s.label}: <strong>{s.count}</strong></li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="mis-panel">
        <h2>Leads by brand</h2>
        <Bars items={countBy(rows, 'brand')} total={sum.total} />
      </section>
      <div className="mis-two mis-two-even">
        <section className="mis-panel">
          <h2>Leads by platform</h2>
          <Bars items={countBy(rows, 'platform')} total={sum.total} />
        </section>
        <section className="mis-panel">
          <h2>Leads by month</h2>
          <Bars items={countBy(rows, 'month').map((m) => ({ ...m, label: monthLabel(m.label) }))} total={sum.total} />
        </section>
      </div>
    </>
  )
}

function GroupView({ rows, field, label }) {
  const table = useMemo(() => groupTable(rows, field), [rows, field])
  return (
    <section className="mis-panel">
      <div className="mis-scroll">
        <table className="mis-table">
          <thead>
            <tr>
              <th>{label}</th><th>Leads</th><th>Positively closed</th><th>Negatively closed</th><th>In Process</th><th>Open / Pending</th><th>Complaints</th><th>Conversion</th><th className="mis-spread">Split</th>
            </tr>
          </thead>
          <tbody>
            {table.map((t) => (
              <tr key={t.label}>
                <td><strong>{t.label}</strong></td>
                <td>{t.total}</td><td>{t.positive}</td><td>{t.negative}</td><td>{t.inProcess}</td><td>{t.open}</td><td>{t.complaints}</td>
                <td>{t.conversion.toFixed(1)}%</td>
                <td className="mis-spread">
                  <div className="mis-stack" aria-hidden="true">
                    {[['Positively closed', t.positive], ['Negatively closed', t.negative], ['In Process', t.inProcess], ['Open / Pending', t.open], ['Complaint', t.complaints]].map(([s, n]) => (
                      n > 0 ? <div key={s} style={{ width: `${(n / t.total) * 100}%`, background: STATUS_COLOR[s] }} /> : null
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!table.length && <tr><td colSpan="9" className="mis-muted">No leads for this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Leads({ rows, search, setSearch, statusOnly, setStatusOnly, page, setPage }) {
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => (!statusOnly || r.status === statusOnly)
      && (!q || [r.name, r.phone, r.brand, r.platform, r.telecaller, r.city, r.remark, r.statusText].some((v) => String(v).toLowerCase().includes(q))))
  }, [rows, search, statusOnly])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const current = Math.min(page, pages)
  const slice = shown.slice((current - 1) * PAGE, current * PAGE)
  return (
    <section className="mis-panel">
      <div className="mis-tools">
        <input type="search" placeholder="Search name, phone, brand, telecaller…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
        <div className="mis-chips" role="group" aria-label="Status">
          <button type="button" className={!statusOnly ? 'is-on' : ''} onClick={() => setStatusOnly('')}>All</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" className={statusOnly === s ? 'is-on' : ''} onClick={() => setStatusOnly(statusOnly === s ? '' : s)}>{s}</button>
          ))}
        </div>
      </div>
      <p className="mis-muted">{shown.length} lead{shown.length === 1 ? '' : 's'}</p>
      <div className="mis-scroll">
        <table className="mis-table">
          <thead>
            <tr><th>#</th><th>Date</th><th>Customer</th><th>Phone</th><th>Brand</th><th>Platform</th><th>Stage</th><th>Status</th><th>Telecaller</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.n}>
                <td>{r.n}</td>
                <td>{r.date ? r.date.split('-').reverse().join('-') : '—'}</td>
                <td><strong>{r.name || '—'}</strong>{r.city && <small> · {r.city}</small>}</td>
                <td>{r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a> : '—'}</td>
                <td>{r.brand}</td><td>{r.platform}</td><td>{r.stage}</td>
                <td><Chip status={r.status} />{r.statusText && r.statusText.toLowerCase() !== r.status.toLowerCase() && <small> {r.statusText}</small>}</td>
                <td>{r.telecaller}</td><td className="mis-remark">{r.remark}</td>
              </tr>
            ))}
            {!slice.length && <tr><td colSpan="10" className="mis-muted">No leads match.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mis-pager">
          <button type="button" className="mis-btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>← Previous</button>
          <span>Page {current} of {pages}</span>
          <button type="button" className="mis-btn" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next →</button>
        </div>
      )}
    </section>
  )
}

function Reports({ filtered, filters, set, options }) {
  const stamp = new Date().toISOString().slice(0, 10)
  const summaryHeader = (name) => [name, 'Leads', 'Positively closed', 'Negatively closed', 'In Process', 'Open / Pending', 'Complaints', 'Enquiries', 'Conversion %']
  const summaryRows = (key, rename = (x) => x) => groupTable(filtered, key).map((t) => [rename(t.label), t.total, t.positive, t.negative, t.inProcess, t.open, t.complaints, t.enquiries, t.conversion.toFixed(1)])
  const reports = [
    ['All leads', `Every lead in the selection (${filtered.length}), with every column the dashboard reads.`, () => downloadCsv(`mis-leads-${stamp}.csv`,
      ['#', 'Date', 'Customer', 'Phone', 'City', 'Brand', 'Platform', 'Product', 'Stage', 'Status', 'Status in sheet', 'Telecaller', 'Remarks'],
      filtered.map((r) => [r.n, r.date, r.name, r.phone, r.city, r.brand, r.platform, r.product, r.stage, r.status, r.statusText, r.telecaller, r.remark]))],
    ['Summary by brand', 'Leads, closures and conversion for each brand.', () => downloadCsv(`mis-by-brand-${stamp}.csv`, summaryHeader('Brand'), summaryRows('brand'))],
    ['Summary by telecaller', 'How each telecaller’s leads ended.', () => downloadCsv(`mis-by-telecaller-${stamp}.csv`, summaryHeader('Telecaller'), summaryRows('telecaller'))],
    ['Summary by platform', 'Which platforms the leads came from and how they closed.', () => downloadCsv(`mis-by-platform-${stamp}.csv`, summaryHeader('Platform'), summaryRows('platform'))],
    ['Summary by month', 'Leads and conversion month by month.', () => downloadCsv(`mis-by-month-${stamp}.csv`, summaryHeader('Month'), summaryRows('month', monthLabel))],
  ]
  return (
    <>
      <section className="mis-panel">
        <h2>Choose what to include</h2>
        <div className="mis-filters mis-filters-inline">
          <select aria-label="Brand" value={filters.brand} onChange={(e) => set({ brand: e.target.value })}>
            <option value="">All brands</option>
            {options.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select aria-label="Platform" value={filters.platform} onChange={(e) => set({ platform: e.target.value })}>
            <option value="">All platforms</option>
            {options.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Month" value={filters.month} onChange={(e) => set({ month: e.target.value })}>
            <option value="">All months</option>
            {options.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            {options.hasNoDate && <option value="none">No date</option>}
          </select>
        </div>
      </section>
      <div className="mis-reports">
        {reports.map(([name, note, run]) => (
          <section key={name} className="mis-panel mis-report">
            <h2>{name}</h2>
            <p className="mis-muted">{note}</p>
            <button type="button" className="mis-btn mis-btn-primary" onClick={run} disabled={!filtered.length}>Download CSV</button>
          </section>
        ))}
      </div>
    </>
  )
}
