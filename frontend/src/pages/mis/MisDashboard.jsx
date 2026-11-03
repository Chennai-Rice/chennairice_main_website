import { useCallback, useEffect, useMemo, useState } from 'react'
import { signOutStaff, staffJson } from '../../services/staffAuth.js'
import { STATUSES, STATUS_COLOR, STATUS_INK, applyFilters, countBy, downloadCsv, groupTable, monthLabel, pct, summarise, topN } from './aggregate.js'
import './mis.css'

/**
 * The MIS dashboard (Nov 2026): the leads of the MIS Google Sheet as an overview, brands, leads, telecallers and
 * reports. The numbers come from the sheet through the website's server (backend/lib/sales/mis.js); the sheet stays
 * the place where leads are edited. `standalone` is the MIS login's own screen (with sign-out); otherwise it sits
 * inside /admin for the owner and the IT team.
 */
const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  brands: <><path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L3 13.3V4h9.3L20 11.7a1 1 0 0 1 0 .8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  leads: <><path d="M8 4h8M9 2.5h6a1 1 0 0 1 1 1V5H8V3.5a1 1 0 0 1 1-1z" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M8 11h8M8 15h5" /></>,
  telecallers: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  reports: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  total: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4M18 14.4A6 6 0 0 1 21 20" /></>,
  positive: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.2 9.6" /></>,
  negative: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  process: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></>,
  open: <><path d="M4 13h4l1.5 3h5l1.5-3h4" /><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></>,
  conversion: <><path d="M4 18 10 12l4 4 6-8" /><path d="M15 8h5v5" /></>,
  enquiries: <><path d="M4 5h16v11H9l-5 4z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 15.8v.2" /></>,
  complaints: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4M20 20v-4.5h-4.5" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5" /></>,
  out: <><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M16 8l4 4-4 4M20 12H9" /></>,
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
)

const NAV = [['overview', 'Overview'], ['brands', 'Brands'], ['leads', 'Leads'], ['telecallers', 'Telecallers'], ['reports', 'Reports']]
const BAR_COLORS = ['#b9a6ee', '#f2a2c3', '#f7c79b', '#9fd8ef', '#a8e0c2', '#f4d98a']
const PAGE = 50
const REFRESH_MS = 5 * 60_000

const when = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : '')
const num = (n) => Number(n).toLocaleString('en-IN')

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
  const filtering = Boolean(filters.brand || filters.platform || filters.month)

  const title = NAV.find(([id]) => id === view)?.[1] || 'Overview'
  const subtitle = data
    ? `${num(filtered.length)} lead${filtered.length === 1 ? '' : 's'}${filtering ? ` of ${num(rows.length)}` : ''}${data.sheetTitle ? ` · ${data.sheetTitle}` : ''}`
    : ''

  return (
    <div className={`mis mis-${theme}${standalone ? ' is-standalone' : ''}`}>
      <aside className="mis-side">
        <div className="mis-brand">
          <img src="/assets/logo-full-v2.png" alt="" width="40" height="40" />
          <div>
            <strong>Chennai Rice</strong>
            <span>Leads Dashboard</span>
          </div>
        </div>
        <nav className="mis-nav" aria-label="Dashboard sections">
          {NAV.map(([id, label]) => (
            <button key={id} type="button" className={id === view ? 'is-active' : ''} aria-current={id === view ? 'page' : undefined} onClick={() => setView(id)}>
              <Icon name={id} /> {label}
            </button>
          ))}
        </nav>
        <div className="mis-side-foot">
          <p className="mis-sync">
            <span className={`mis-dot${error ? ' is-bad' : ''}`} aria-hidden="true" />
            {error ? 'Sheet not loaded' : data ? `Google Sheet · updated ${when(data.fetchedAt)}` : 'Reading the sheet…'}
          </p>
          <button type="button" className="mis-btn" disabled={loading} onClick={() => load(true)}><Icon name="refresh" /> {loading ? 'Reading…' : 'Refresh now'}</button>
          <button type="button" className="mis-btn" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          {standalone && (
            <button type="button" className="mis-btn" onClick={async () => { await signOutStaff(); window.location.reload() }}><Icon name="out" /> Sign out</button>
          )}
        </div>
      </aside>

      <main className="mis-main">
        <header className="mis-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="mis-sub">{subtitle}</p>}
          </div>
          {data && view !== 'reports' && (
            <div className="mis-filters">
              <Filters filters={filters} set={set} options={options} />
              {filtering && <button type="button" className="mis-link" onClick={() => set({ brand: '', platform: '', month: '' })}>Clear filters</button>}
            </div>
          )}
        </header>

        {error && (
          <div className="mis-alert" role="alert">
            <p>{error}</p>
            <button type="button" className="mis-btn" onClick={() => load(true)}>Try again</button>
          </div>
        )}
        {!data && !error && <Skeleton />}

        {data && <DataNotes data={data} />}

        {data && view === 'overview' && <Overview rows={filtered} sum={sum} />}
        {data && view === 'brands' && <GroupView rows={filtered} field="brand" label="Brand" />}
        {data && view === 'telecallers' && <GroupView rows={filtered} field="telecaller" label="Telecaller" />}
        {data && view === 'leads' && (
          <Leads rows={filtered} search={search} setSearch={(v) => { setSearch(v); setPage(1) }} statusOnly={statusOnly}
            setStatusOnly={(v) => { setStatusOnly(v); setPage(1) }} page={page} setPage={setPage} />
        )}
        {data && view === 'reports' && <Reports filtered={filtered} filters={filters} set={set} options={options} />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------ small parts */

function Filters({ filters, set, options }) {
  return (
    <>
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
    </>
  )
}

function Skeleton() {
  return (
    <div className="mis-skel" aria-label="Reading the Google Sheet">
      <div className="mis-metrics">{Array.from({ length: 8 }, (_, i) => <div key={i} className="mis-metric mis-shimmer" />)}</div>
      <div className="mis-panel mis-shimmer" style={{ height: 220 }} />
    </div>
  )
}

/** What the server found in the sheet: columns it could not match, status words it did not recognise, and every column the sheet has. */
function DataNotes({ data }) {
  const important = ['brand', 'status', 'platform', 'telecaller'].filter((f) => data.missing.includes(f))
  const notes = important.length > 0 || data.unmappedStatuses.length > 0
  const [open, setOpen] = useState(notes)
  const label = { brand: 'Brand', status: 'Status', platform: 'Platform', telecaller: 'Telecaller' }
  return (
    <section className="mis-notes">
      {notes && (
        <p className="mis-warn">
          {important.length > 0 && <>No column was matched for <strong>{important.map((f) => label[f]).join(', ')}</strong>, so those show as “Not specified” or “Open / Pending”. </>}
          {data.unmappedStatuses.length > 0 && (
            <>Status words counted as Open / Pending because they were not recognised: {data.unmappedStatuses.slice(0, 8).map((u) => `“${u.value}” (${u.count})`).join(', ')}. </>
          )}
          Open “About this data” to see the sheet’s column names.
        </p>
      )}
      <button type="button" className="mis-link" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'About this data'}</button>
      {open && (
        <div className="mis-about">
          <p><strong>{data.sheetTitle || 'MIS sheet'}</strong> · {num(data.rows.length)} leads read · dates read for {num(data.datesRead)}</p>
          <p className="mis-about-h">Columns in your sheet</p>
          <div className="mis-tags">
            {data.headers.map((h) => {
              const used = Object.entries(data.mapping).find(([, col]) => col === h)
              return <span key={h} className={`mis-tag${used ? ' is-used' : ''}`} title={used ? `used for ${used[0]}` : 'not used yet'}>{h}{used ? ` → ${used[0]}` : ''}</span>
            })}
          </div>
          {data.missing.length > 0 && <p className="mis-about-m">Not matched: {data.missing.join(', ')}</p>}
        </div>
      )}
    </section>
  )
}

function Metric({ tone, icon, label, value, note }) {
  return (
    <div className={`mis-metric tone-${tone}`}>
      <div className="mis-metric-top">
        <span>{label}</span>
        <i className="mis-metric-icon"><Icon name={icon} /></i>
      </div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
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
            <span><strong>{num(it.count)}</strong>{showPct && <em> · {pct(it.count, total)}%</em>}</span>
          </div>
          <div className="mis-bar-track"><div className={`mis-bar${it.muted || it.label === 'Not specified' ? ' is-muted' : ''}`} style={{ width: `${(it.count / max) * 100}%`, ...(it.muted || it.label === 'Not specified' ? {} : { background: BAR_COLORS[n % BAR_COLORS.length] }) }} /></div>
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
      <circle cx="90" cy="90" r={R} fill="none" className="mis-donut-bg" strokeWidth="24" />
      {parts.filter((p) => p.count > 0).map((p) => {
        const len = (p.count / total) * C
        const el = (
          <circle key={p.label} cx="90" cy="90" r={R} fill="none" stroke={STATUS_COLOR[p.label]} strokeWidth="24"
            strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`} strokeDashoffset={-used} transform="rotate(-90 90 90)" />
        )
        used += len
        return el
      })}
      <text x="90" y="88" textAnchor="middle" className="mis-donut-n">{num(total)}</text>
      <text x="90" y="108" textAnchor="middle" className="mis-donut-l">leads</text>
    </svg>
  )
}

const Chip = ({ status }) => (
  <span className="mis-chip" style={{ background: `${STATUS_COLOR[status]}33`, color: STATUS_INK[status] }}>{status}</span>
)

/* ---------------------------------------------------------------- screens */

function Overview({ rows, sum }) {
  const status = STATUSES.map((s) => ({ label: s, count: rows.filter((r) => r.status === s).length }))
  const share = (n) => (sum.total ? `${pct(n, sum.total)}% of leads` : '')
  return (
    <>
      <div className="mis-metrics">
        <Metric tone="slate" icon="total" label="Total leads" value={num(sum.total)} note="In the selection" />
        <Metric tone="green" icon="positive" label="Positively closed" value={num(sum.positive)} note={share(sum.positive)} />
        <Metric tone="red" icon="negative" label="Negatively closed" value={num(sum.negative)} note={share(sum.negative)} />
        <Metric tone="blue" icon="process" label="In process" value={num(sum.inProcess)} note={share(sum.inProcess)} />
        <Metric tone="amber" icon="open" label="Open / pending" value={num(sum.open)} note={share(sum.open)} />
        <Metric tone="maroon" icon="conversion" label="Conversion" value={`${sum.conversion.toFixed(1)}%`} note="Positively closed ÷ all leads" />
        <Metric tone="teal" icon="enquiries" label="Enquiries" value={num(sum.enquiries)} note={share(sum.enquiries)} />
        <Metric tone="purple" icon="complaints" label="Complaints" value={num(sum.complaints)} note={share(sum.complaints)} />
      </div>

      <div className="mis-two">
        <section className="mis-panel">
          <h2>Leads by stage</h2>
          <Bars items={topN(countBy(rows, 'stage'), 7)} total={sum.total} showPct />
        </section>
        <section className="mis-panel">
          <h2>Lead status</h2>
          <div className="mis-status">
            {sum.total > 0 ? <Donut parts={status} total={sum.total} /> : <p className="mis-muted">No leads for this selection.</p>}
            <ul className="mis-legend">
              {status.map((s) => (
                <li key={s.label}><i style={{ background: STATUS_COLOR[s.label] }} />{s.label}<strong>{num(s.count)}</strong></li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="mis-two mis-two-even">
        <section className="mis-panel">
          <h2>Leads by brand</h2>
          <Bars items={topN(countBy(rows, 'brand'), 8)} total={sum.total} />
        </section>
        <section className="mis-panel">
          <h2>Leads by month</h2>
          <Bars items={countBy(rows, 'month').map((m) => ({ ...m, label: monthLabel(m.label) }))} total={sum.total} />
        </section>
      </div>

      <section className="mis-panel">
        <h2>Leads by platform</h2>
        <Bars items={topN(countBy(rows, 'platform'), 10)} total={sum.total} />
      </section>
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
              <th>{label}</th><th className="r">Leads</th><th className="r">Positive</th><th className="r">Negative</th><th className="r">In process</th><th className="r">Open</th><th className="r">Complaints</th><th className="r">Conversion</th><th className="mis-spread">Split</th>
            </tr>
          </thead>
          <tbody>
            {table.map((t) => (
              <tr key={t.label}>
                <td><strong>{t.label}</strong></td>
                <td className="r">{num(t.total)}</td><td className="r">{num(t.positive)}</td><td className="r">{num(t.negative)}</td><td className="r">{num(t.inProcess)}</td><td className="r">{num(t.open)}</td><td className="r">{num(t.complaints)}</td>
                <td className="r"><strong>{t.conversion.toFixed(1)}%</strong></td>
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
      <p className="mis-legend-row">
        {STATUSES.map((s) => <span key={s}><i style={{ background: STATUS_COLOR[s] }} />{s}</span>)}
      </p>
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
      <p className="mis-muted mis-count">{num(shown.length)} {shown.length === 1 ? 'lead' : 'leads'}</p>
      <div className="mis-scroll mis-scroll-tall">
        <table className="mis-table">
          <thead>
            <tr><th>#</th><th>Date</th><th>Customer</th><th>Phone</th><th>Brand</th><th>Platform</th><th>Stage</th><th>Status</th><th>Telecaller</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.n}>
                <td className="mis-n">{r.n}</td>
                <td className="nowrap">{r.date ? r.date.split('-').reverse().join('-') : '—'}</td>
                <td><strong>{r.name || '—'}</strong>{r.city && <small> · {r.city}</small>}</td>
                <td className="nowrap">{r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a> : '—'}</td>
                <td>{r.brand}</td><td>{r.platform}</td><td>{r.stage}</td>
                <td className="nowrap"><Chip status={r.status} />{r.statusText && r.statusText.toLowerCase() !== r.status.toLowerCase() && <small className="mis-raw"> {r.statusText}</small>}</td>
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
    ['All leads', `Every lead in the selection (${num(filtered.length)}), with every column the dashboard reads.`, () => downloadCsv(`mis-leads-${stamp}.csv`,
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
        <div className="mis-filters mis-filters-inline"><Filters filters={filters} set={set} options={options} /></div>
        <p className="mis-muted mis-count">{num(filtered.length)} leads selected</p>
      </section>
      <div className="mis-reports">
        {reports.map(([name, note, run]) => (
          <section key={name} className="mis-panel mis-report">
            <div>
              <h2>{name}</h2>
              <p className="mis-muted">{note}</p>
            </div>
            <button type="button" className="mis-btn mis-btn-primary" onClick={run} disabled={!filtered.length}>Download CSV</button>
          </section>
        ))}
      </div>
    </>
  )
}
