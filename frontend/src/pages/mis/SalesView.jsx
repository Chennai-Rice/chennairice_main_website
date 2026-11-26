import { useMemo, useState } from 'react'
import { applyFilters, downloadCsv } from './aggregate.js'

/**
 * The MIS "Sales" view (Nov 2026): the B2C and B2B tabs of the sheet, ranked by BILL VALUE.
 * Which manager closed the most, which telesales person sold the most. A sale is a row with a bill value above zero.
 * Rows marked "Sale completed" with no bill value are listed at the bottom so the sheet can be fixed.
 */
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN')
const num = (n) => Number(n).toLocaleString('en-IN')
const TYPES = [['all', 'All'], ['B2C', 'B2C'], ['B2B', 'B2B']]

/** One leaderboard: people (or sources) ranked by bill value, with their leads, sales and average bill. */
function rank(rows, field) {
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

function Stat({ tone, label, value, note }) {
  return (
    <div className={`mis-metric tone-${tone}`}>
      <div className="mis-metric-top"><span>{label}</span></div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
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

export default function SalesView({ sales = [], filters }) {
  const [type, setType] = useState('all')
  const tabs = sales.filter((t) => !t.error && t.rows)
  const rows = useMemo(() => {
    const all = tabs.filter((t) => type === 'all' || t.type === type).flatMap((t) => t.rows)
    return applyFilters(all, { month: filters.month, from: filters.from, to: filters.to })
  }, [sales, type, filters.month, filters.from, filters.to])

  const sold = rows.filter((r) => r.sale)
  const bill = sold.reduce((a, r) => a + r.bill, 0)
  const missing = rows.filter((r) => r.missingBill)
  const managerBlank = sold.length ? sold.filter((r) => r.manager === 'Not assigned').length / sold.length : 0
  const managers = useMemo(() => rank(rows, 'manager'), [rows])
  const telesales = useMemo(() => rank(rows, 'telesales'), [rows])
  const sources = useMemo(() => rank(rows, 'source'), [rows])
  const problems = sales.filter((t) => t.error || t.missing?.includes('bill'))

  const exportCsv = () => downloadCsv('mis-sales.csv',
    ['Tab', 'Date', 'Telesales', 'Manager', 'ASM', 'Source', 'Customer', 'Phone', 'City', 'Product', 'KG', 'Qty', 'Bill value', 'Status', 'Remarks'],
    rows.filter((r) => r.sale || r.missingBill).map((r) => [r.type, r.date, r.telesales, r.manager, r.asm, r.source, r.name, r.phone, r.city, r.product, r.kg, r.qty, r.bill, r.status, r.remark]))

  if (!sales.length) return <p className="mis-warn">The B2B / B2C tabs were not found in the sheet, so there is no sales data to show.</p>

  return (
    <>
      <div className="mis-which-row">
        <div className="mis-theme mis-which" role="group" aria-label="Sales type">
          {TYPES.map(([id, label]) => (
            <button key={id} type="button" className={type === id ? 'is-on' : ''} aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>
          ))}
        </div>
        <button type="button" className="mis-btn" disabled={!sold.length && !missing.length} onClick={exportCsv}>Export sales</button>
      </div>

      {problems.map((t) => (
        <p key={t.type} className="mis-warn">
          {t.error ? `The ${t.type} tab could not be read: ${t.error}` : `The ${t.type} tab has no BILL VALUE column, so its sales show as ₹0.`}
        </p>
      ))}

      <div className="mis-metrics">
        <Stat tone="maroon" label="Total bill value" value={inr(bill)} note={`${type === 'all' ? 'B2C + B2B' : type} · in the selection`} />
        <Stat tone="green" label="Sales" value={num(sold.length)} note="Rows with a bill value" />
        <Stat tone="blue" label="Average bill" value={sold.length ? inr(bill / sold.length) : '–'} note="Bill value ÷ sales" />
        <Stat tone="amber" label="Lead to sale" value={rows.length ? `${((sold.length / rows.length) * 100).toFixed(1)}%` : '0%'} note={`${num(sold.length)} of ${num(rows.length)} leads`} />
      </div>

      {managerBlank > 0.3 && (
        <p className="mis-warn">
          {Math.round(managerBlank * 100)}% of the sales have no Manager in the sheet (blank or #REF!), so they are counted under "Not assigned". Fix the MANAGER column and this ranking fills in by itself.
        </p>
      )}

      <Board title="Managers: who closed the most" hint="Ranked by bill value closed." list={managers} top={15} showSplit={type === 'all'} />
      <Board title="Telesales: who sold the most" hint="The person in LEAD GENERATED BY, ranked by bill value." list={telesales} top={15} showSplit={type === 'all'} />
      <Board title="Lead source: where the sales came from" list={sources} top={12} showSplit={false} />

      {missing.length > 0 && (
        <section className="mis-panel">
          <h2>{num(missing.length)} "Sale completed" with no bill value</h2>
          <p className="mis-muted">These are marked as sold in the sheet but the BILL VALUE is empty, so they add ₹0 above. Fill the value in the sheet to count them.</p>
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
