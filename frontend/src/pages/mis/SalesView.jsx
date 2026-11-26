import { useMemo, useState } from 'react'
import { applyFilters, downloadCsv } from './aggregate.js'

/**
 * The MIS "Sales" dashboard (Nov 2026): the B2C and B2B tabs of the sheet (bill value per order) joined to the CALLS tab
 * by phone number. Filters, KPI cards, B2B/B2C split, funnel, lead sources, telesales and manager performance, pending
 * follow-ups, key insights and a data-quality card, so nothing in the sheet goes unseen.
 *
 * A "sale" is a row with a bill value above zero. "Called" means the lead's phone is in the CALLS tab.
 * Brand and Region filters appear only when the sheet has those columns (the sales tabs have neither yet).
 */
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
const inrShort = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n))
const num = (n) => Number(n).toLocaleString('en-IN')
const pc = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0')
const C = { green: '#0a7b43', orange: '#f7931e', blue: '#3b82f6', purple: '#8b5cf6', teal: '#3a9bb0', navy: '#1f4e5f', grey: '#9aa5b1' }
const last10 = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)

/** Today in India as YYYY-MM-DD, and whole days between two such dates. */
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

function group(rows, field) {
  const map = new Map()
  for (const r of rows) {
    const g = map.get(r[field]) || { label: r[field], leads: 0, sales: 0, bill: 0, b2b: 0, b2c: 0 }
    g.leads += 1
    if (r.sale) {
      g.sales += 1
      g.bill += r.bill
      if (r.type === 'B2B') g.b2b += r.bill
      else g.b2c += r.bill
    }
    map.set(r[field], g)
  }
  return [...map.values()].sort((a, b) => b.bill - a.bill || b.sales - a.sales || b.leads - a.leads || String(a.label).localeCompare(String(b.label)))
}

/* ------------------------------------------------------------------ pieces */

function Stat({ tone, label, value, note }) {
  return (
    <div className={`mis-metric tone-${tone}`}>
      <div className="mis-metric-top"><span>{label}</span></div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}

function SDonut({ parts, center, sub }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  const R = 46
  const L = 2 * Math.PI * R
  let at = 0
  return (
    <div className="sv-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(120,130,160,0.18)" strokeWidth="16" />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * L
          const el = <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${len} ${L - len}`} strokeDashoffset={-at} transform="rotate(-90 60 60)" />
          at += len
          return el
        })}
      </svg>
      <div className="sv-donut-mid"><strong>{center}</strong><small>{sub}</small></div>
      <ul className="sv-legend">
        {parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label} <b>({num(p.value)})</b></li>)}
      </ul>
    </div>
  )
}

/** Two bars per item (e.g. leads and orders). */
function Columns({ items, a, b, aColor = C.green, bColor = C.orange, money = false }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.a, i.b || 0)))
  const fmt = money ? inrShort : num
  return (
    <div className="sv-cols-wrap">
      <div className="sv-cols" style={{ minWidth: items.length * 64 }}>
        {items.map((i) => (
          <div key={i.label} className="sv-col">
            <div className="sv-bars">
              <div className="sv-bar" style={{ height: `${(i.a / max) * 100}%`, background: aColor }}><span>{fmt(i.a)}</span></div>
              {b && <div className="sv-bar" style={{ height: `${((i.b || 0) / max) * 100}%`, background: bColor }}><span>{fmt(i.b || 0)}</span></div>}
            </div>
            <em title={i.label}>{i.label}</em>
          </div>
        ))}
        {!items.length && <p className="mis-muted">No rows for this selection.</p>}
      </div>
      {b && <p className="sv-key"><i style={{ background: aColor }} />{a} <i style={{ background: bColor }} />{b}</p>}
    </div>
  )
}

function Funnel({ stages }) {
  const top = Math.max(1, stages[0]?.value || 1)
  return (
    <div className="sv-funnel">
      {stages.map((s) => (
        <div key={s.label} className="sv-funnel-row" style={{ width: `${Math.max(34, (s.value / top) * 100)}%`, background: s.color }}>
          {num(s.value)} {s.label} ({pc(s.value, top)}%)
        </div>
      ))}
    </div>
  )
}

function Board({ title, hint, list, top, showSplit }) {
  const max = Math.max(1, ...list.map((g) => g.bill))
  return (
    <section className="mis-panel">
      <h2>{title}</h2>
      {hint && <p className="mis-muted">{hint}</p>}
      <div className="mis-scroll">
        <table className="mis-table">
          <thead>
            <tr>
              <th>#</th><th>Name</th><th className="r">Leads</th><th className="r">Sales</th><th className="r">Bill value</th><th className="r">Avg bill</th>
              {showSplit && <><th className="r">B2C</th><th className="r">B2B</th></>}
              <th className="mis-spread">Share</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, top).map((g, i) => (
              <tr key={g.label}>
                <td>{g.bill > 0 ? i + 1 : '–'}</td>
                <td><strong>{g.label}</strong></td>
                <td className="r">{num(g.leads)}</td>
                <td className="r">{num(g.sales)}</td>
                <td className="r"><strong>{inr(g.bill)}</strong></td>
                <td className="r">{g.sales ? inr(g.bill / g.sales) : '–'}</td>
                {showSplit && <><td className="r">{inr(g.b2c)}</td><td className="r">{inr(g.b2b)}</td></>}
                <td className="mis-spread"><div className="mis-rankbar" aria-hidden="true"><i style={{ width: `${(g.bill / max) * 100}%` }} /></div></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="9" className="mis-muted">No rows for this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Pick({ label, value, onChange, options }) {
  return (
    <label className="sv-pick">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

/* -------------------------------------------------------------------- view */

const NO_FILTER = { type: '', brand: '', source: '', manager: '', asm: '', telesales: '' }

export default function SalesView({ sales = [], calls = [], filters }) {
  const [f, setF] = useState(NO_FILTER)
  const setOne = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const tabs = sales.filter((t) => !t.error && t.rows)
  const all = useMemo(() => tabs.flatMap((t) => t.rows), [sales])
  const dated = useMemo(() => applyFilters(all, { month: filters.month, from: filters.from, to: filters.to }), [all, filters.month, filters.from, filters.to])
  const rows = useMemo(() => dated.filter((r) => (!f.type || r.type === f.type) && (!f.brand || r.brand === f.brand) && (!f.source || r.source === f.source)
    && (!f.manager || r.manager === f.manager) && (!f.asm || r.asm === f.asm) && (!f.telesales || r.telesales === f.telesales)), [dated, f])
  const opts = useMemo(() => {
    const u = (k) => [...new Set(dated.map((r) => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
    return { brand: u('brand'), source: u('source'), manager: u('manager'), asm: u('asm'), telesales: u('telesales') }
  }, [dated])

  // Calls (CALLS tab): by phone number, last call per number, and the calls inside the chosen dates.
  const callInfo = useMemo(() => {
    const byPhone = new Map()
    for (const c of calls) {
      const p = last10(c.phone)
      if (p.length < 10) continue
      const e = byPhone.get(p) || { n: 0, last: '' }
      e.n += 1
      if (c.date && c.date > e.last) e.last = c.date
      byPhone.set(p, e)
    }
    return byPhone
  }, [calls])
  const periodCalls = useMemo(() => applyFilters(calls, { month: filters.month, from: filters.from, to: filters.to }), [calls, filters.month, filters.from, filters.to])

  const sold = rows.filter((r) => r.sale)
  const bill = sold.reduce((a, r) => a + r.bill, 0)
  const called = rows.filter((r) => callInfo.has(last10(r.phone)))
  const neverCalled = rows.filter((r) => !r.sale && !callInfo.has(last10(r.phone)))
  const connected = periodCalls.filter((c) => c.outcome === 'connected').length
  const rnr = periodCalls.filter((c) => c.outcome === 'rnr').length

  const byType = [['B2B', C.green], ['B2C', C.orange]].map(([t, color]) => ({ label: t, color, leads: rows.filter((r) => r.type === t).length, orders: sold.filter((r) => r.type === t).length, bill: sold.filter((r) => r.type === t).reduce((a, r) => a + r.bill, 0) }))
  const sources = useMemo(() => group(rows, 'source').sort((a, b) => b.leads - a.leads), [rows])
  const telesales = useMemo(() => group(rows, 'telesales'), [rows])
  const managers = useMemo(() => group(rows, 'manager'), [rows])
  const asms = useMemo(() => group(rows, 'asm'), [rows])

  // Pending follow-ups: leads that are not sold, by days since the last call (or never called).
  const today = todayIst()
  const pend = { never: neverCalled.length, d02: 0, d37: 0, d815: 0, d15: 0 }
  for (const r of rows) {
    if (r.sale) continue
    const e = callInfo.get(last10(r.phone))
    if (!e || !e.last) continue
    const d = daysBetween(e.last, today)
    if (d <= 2) pend.d02 += 1
    else if (d <= 7) pend.d37 += 1
    else if (d <= 15) pend.d815 += 1
    else pend.d15 += 1
  }
  const pending = Object.values(pend).reduce((a, b) => a + b, 0)

  // Data quality: what could make the numbers wrong.
  const phoneCount = new Map()
  for (const r of rows) {
    const p = last10(r.phone)
    if (p.length === 10) phoneCount.set(p, (phoneCount.get(p) || 0) + 1)
  }
  const dupPhones = [...phoneCount.values()].filter((n) => n > 1).length
  const quality = [
    ['Phone numbers repeated in more than one lead', dupPhones, 'Counted as separate leads'],
    ['Sales with no Manager (blank or #REF!)', sold.filter((r) => r.manager === 'Not assigned').length, 'Shown as "Not assigned"'],
    ['"Sale completed" with no bill value', rows.filter((r) => r.missingBill).length, 'Add the value to count them'],
    ['Leads with no telesales name', rows.filter((r) => r.telesales === 'Not assigned').length, 'Shown as "Not assigned"'],
    ['Leads with no phone number', rows.filter((r) => last10(r.phone).length < 10).length, 'Cannot be matched to calls'],
  ]
  const missing = rows.filter((r) => r.missingBill)
  const problems = sales.filter((t) => t.error || t.missing?.includes('bill'))

  const topSource = sources[0]
  const topTele = telesales.find((g) => g.bill > 0)
  const topMgr = managers.find((g) => g.bill > 0 && g.label !== 'Not assigned')
  const b2bShare = pc(byType[0].orders, sold.length)

  const exportCsv = () => downloadCsv('mis-sales.csv',
    ['Tab', 'Date', 'Telesales', 'Manager', 'ASM', 'Source', 'Customer', 'Phone', 'City', 'Product', 'KG', 'Qty', 'Bill value', 'Status', 'Remarks'],
    rows.filter((r) => r.sale || r.missingBill).map((r) => [r.type, r.date, r.telesales, r.manager, r.asm, r.source, r.name, r.phone, r.city, r.product, r.kg, r.qty, r.bill, r.status, r.remark]))

  if (!sales.length) return <p className="mis-warn">The B2B / B2C tabs were not found in the sheet, so there is no sales data to show.</p>

  const filtering = Object.values(f).some(Boolean)
  return (
    <>
      <div className="sv-banner">
        <div><strong>Lead &amp; Sales Dashboard</strong><span>B2B + B2C performance · from the sheet's B2B and B2C tabs</span></div>
        <button type="button" className="mis-btn" disabled={!sold.length && !missing.length} onClick={exportCsv}>Export sales</button>
      </div>

      <div className="sv-filters">
        <Pick label="Business type" value={f.type} onChange={setOne('type')} options={['B2B', 'B2C']} />
        {opts.brand.length > 0 && <Pick label="Brand" value={f.brand} onChange={setOne('brand')} options={opts.brand} />}
        <Pick label="Lead source" value={f.source} onChange={setOne('source')} options={opts.source} />
        <Pick label="Manager" value={f.manager} onChange={setOne('manager')} options={opts.manager} />
        <Pick label="ASM" value={f.asm} onChange={setOne('asm')} options={opts.asm} />
        <Pick label="Telesales" value={f.telesales} onChange={setOne('telesales')} options={opts.telesales} />
        {filtering && <button type="button" className="mis-link" onClick={() => setF(NO_FILTER)}>Clear</button>}
      </div>

      {problems.map((t) => (
        <p key={t.type} className="mis-warn">
          {t.error ? `The ${t.type} tab could not be read: ${t.error}` : `The ${t.type} tab has no BILL VALUE column, so its sales show as ₹0.`}
        </p>
      ))}

      <div className="mis-metrics sv-kpis">
        <Stat tone="green" label="Total leads" value={num(rows.length)} note={`${num(called.length)} called · ${num(neverCalled.length)} never called`} />
        <Stat tone="blue" label="Total orders" value={num(sold.length)} note="Rows with a bill value" />
        <Stat tone="maroon" label="Total revenue" value={inrShort(bill)} note={`Average bill ${sold.length ? inr(bill / sold.length) : '–'}`} />
        <Stat tone="purple" label="Lead to order" value={`${pc(sold.length, rows.length)}%`} note={`${num(sold.length)} of ${num(rows.length)} leads`} />
        <Stat tone="teal" label="Calls made" value={num(periodCalls.length)} note={`${num(connected)} connected · ${num(rnr)} no response`} />
      </div>

      <div className="mis-two">
        <section className="mis-panel">
          <h2>B2B vs B2C</h2>
          <SDonut center={num(rows.length)} sub="Leads" parts={byType.map((t) => ({ label: t.label, value: t.leads, color: t.color }))} />
        </section>
        <section className="mis-panel">
          <h2>Orders split</h2>
          <SDonut center={num(sold.length)} sub="Orders" parts={byType.map((t) => ({ label: t.label, value: t.orders, color: t.color }))} />
          <p className="mis-muted">Revenue: B2C {inr(byType[1].bill)} · B2B {inr(byType[0].bill)}</p>
        </section>
      </div>

      <div className="mis-two">
        <section className="mis-panel">
          <h2>Lead funnel</h2>
          <Funnel stages={[
            { label: 'Leads', value: rows.length, color: C.green },
            { label: 'Called', value: called.length, color: '#4aa56f' },
            { label: 'Orders', value: sold.length, color: C.purple },
          ]} />
          <p className="mis-muted">"Called" = the lead's phone number is in the CALLS tab.</p>
        </section>
        <section className="mis-panel">
          <h2>Pending follow-ups</h2>
          <SDonut center={num(pending)} sub="Pending" parts={[
            { label: 'Never called', value: pend.never, color: C.grey },
            { label: '0–2 days since call', value: pend.d02, color: C.green },
            { label: '3–7 days', value: pend.d37, color: C.blue },
            { label: '8–15 days', value: pend.d815, color: C.orange },
            { label: '15+ days', value: pend.d15, color: C.purple },
          ]} />
        </section>
      </div>

      <section className="mis-panel">
        <h2>Leads by source</h2>
        <Columns items={sources.slice(0, 12).map((g) => ({ label: g.label, a: g.leads, b: g.sales }))} a="Leads" b="Orders" />
      </section>

      <div className="mis-two">
        <section className="mis-panel">
          <h2>Telesales performance</h2>
          <Columns items={telesales.map((g) => ({ label: g.label, a: g.leads, b: g.sales }))} a="Leads" b="Orders" />
        </section>
        <section className="mis-panel">
          <h2>Manager performance</h2>
          <Columns items={managers.slice(0, 8).map((g) => ({ label: g.label, a: g.leads, b: g.sales }))} a="Leads" b="Orders" aColor={C.green} bColor={C.navy} />
        </section>
      </div>

      <section className="mis-panel">
        <h2>Key insights</h2>
        <div className="sv-insights">
          <div><strong>{inrShort(bill)}</strong><small>Revenue in this selection</small></div>
          <div><strong>{b2bShare}%</strong><small>Orders from B2B</small></div>
          <div><strong>{topSource ? topSource.label : '–'}</strong><small>{topSource ? `Top source (${pc(topSource.leads, rows.length)}% of leads)` : 'Top source'}</small></div>
          <div><strong>{topTele ? topTele.label : '–'}</strong><small>{topTele ? `Top telesales (${inr(topTele.bill)})` : 'Top telesales'}</small></div>
          <div><strong>{topMgr ? topMgr.label : '–'}</strong><small>{topMgr ? `Top manager (${inr(topMgr.bill)})` : 'Top manager: none filled in the sheet'}</small></div>
        </div>
      </section>

      <section className="mis-panel">
        <h2>Data check</h2>
        <p className="mis-muted">What could make these numbers wrong. Fix it in the sheet and it clears here by itself.</p>
        <table className="mis-table">
          <tbody>
            {quality.map(([text, n, note]) => (
              <tr key={text}><td>{text}</td><td className="r"><strong className={n ? 'sv-bad' : 'sv-ok'}>{num(n)}</strong></td><td className="mis-muted">{note}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <Board title="Managers: who closed the most" hint="Ranked by bill value closed." list={managers} top={15} showSplit={!f.type} />
      <Board title="Telesales: who sold the most" hint="The person in LEAD GENERATED BY, ranked by bill value." list={telesales} top={15} showSplit={!f.type} />
      {asms.length > 0 && <Board title="ASM" list={asms} top={15} showSplit={false} />}

      {missing.length > 0 && (
        <section className="mis-panel">
          <h2>{num(missing.length)} "Sale completed" with no bill value</h2>
          <div className="mis-scroll">
            <table className="mis-table">
              <thead><tr><th>Date</th><th>Tab</th><th>Customer</th><th>Phone</th><th>Telesales</th><th>Product</th></tr></thead>
              <tbody>
                {missing.slice(0, 50).map((r) => (
                  <tr key={r.type + r.n}><td>{r.date}</td><td>{r.type}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.telesales}</td><td>{r.product}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
