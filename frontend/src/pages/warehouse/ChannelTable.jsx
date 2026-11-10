import { useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import './warehouse.css'
import './warehouse-pages.css'

// Ad campaigns → All-in-one report (Nov 2026): every channel side by side for the chosen period — sales from the
// dashboard (revenue, orders, average order value), website visits, and the leads funnel (leads, converted,
// converted revenue, not converted, lead conversion).
const inr = (n) => (n == null ? '–' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }))
const num = (n) => (n ? Number(n).toLocaleString('en-IN') : '–')
const ROWS = [
  { key: 'revenue', label: 'Revenue', fmt: (c) => (c.revenue ? inr(c.revenue) : '–') },
  { key: 'orders', label: 'Orders', fmt: (c) => num(c.orders) },
  { key: 'visits', label: 'Website visits', fmt: (c) => num(c.visits) },
  { key: 'leads', label: 'Leads', dot: '#f0a95b', bold: true, fmt: (c) => num(c.leads) },
  { key: 'converted', label: 'Converted', dot: '#3fb37f', bold: true, fmt: (c) => (c.leads ? String(c.converted) : '–') },
  { key: 'convertedRevenue', label: 'Converted revenue', fmt: (c) => (c.leads ? (c.convertedRevenue ? inr(c.convertedRevenue) : '₹0') : '–') },
  { key: 'notConverted', label: 'Not converted', dot: '#d9466f', bold: true, fmt: (c) => (c.leads ? String(c.notConverted) : '–') },
  { key: 'conversion', label: 'Lead conversion', fmt: (c) => (c.conversion == null ? '–' : c.conversion + '%') },
  { key: 'aov', label: 'Avg order value', fmt: (c) => (c.aov == null ? '–' : inr(c.aov)) },
]
// Meta's own numbers (Ads Manager), shown in the Meta ads column only.
const META_ROWS = [
  { key: 'metaPurchases', label: 'Meta reported purchases', dot: '#1877f2', bold: true, fmt: (m) => (m.purchases == null ? '–' : num(m.purchases) || '0') },
  { key: 'metaSpend', label: 'Meta ad spend', fmt: (m) => (m.spend == null ? '–' : inr(m.spend)) },
]

export default function ChannelTable({ rq, range, say, onAuthError }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    setData(null)
    staffJson(`/api/admin/warehouse/channels?${rq}`).then((d) => live && setData(d)).catch((err) => { if (!onAuthError(err)) say(err.message, 'error') })
    return () => { live = false }
  }, [rq, say, onAuthError])

  const cols = data ? [...data.columns.filter((c) => c.revenue || c.orders || c.visits || c.leads), data.total] : []

  function csv() {
    const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const lines = [['Metric', ...cols.map((c) => c.label)], ...ROWS.map((r) => [r.label, ...cols.map((c) => r.fmt(c).replace('₹', 'Rs '))])]
    if (data.meta?.connected && !data.meta.error) META_ROWS.forEach((r) => lines.push([r.label, ...cols.map((c) => (c.key === 'meta' ? String(r.fmt(data.meta)).replace('₹', 'Rs ') : '–'))]))
    const blob = new Blob(['\ufeff' + lines.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ad-campaigns-report-${range.from}-to-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="wh-panel wh-src chn">
      <header className="wh-src-head">
        <div>
          <h2 className="wh-panel-title">All-in-one report</h2>
          <p className="wh-muted wh-small">
            Every channel side by side, {range.from === range.to ? range.from : `${range.from} to ${range.to}`}. Leads are contest sign-ups,
            WhatsApp chats and expo QR (one per mobile); converted = paid an order after becoming a lead.
          </p>
        </div>
        <button type="button" className="wh-btn wh-btn--outline" onClick={csv} disabled={!data}>Download CSV</button>
      </header>
      {!data ? <p className="wh-empty">Loading…</p> : (
        <div className="chn-wrap">
          <table className="chn-table">
            <thead>
              <tr><th>Metric</th>{cols.map((c) => <th key={c.key} className={c.key === 'total' ? 'is-total' : ''}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key} className={r.bold ? 'is-bold' : ''}>
                  <th scope="row">{r.dot && <i className="chn-dot" style={{ background: r.dot }} />}{r.label}</th>
                  {cols.map((c) => <td key={c.key} className={c.key === 'total' ? 'is-total' : ''}>{r.fmt(c)}</td>)}
                </tr>
              ))}
              {data.meta?.connected && !data.meta.error && META_ROWS.map((r) => (
                <tr key={r.key} className={'chn-meta' + (r.bold ? ' is-bold' : '')}>
                  <th scope="row">{r.dot && <i className="chn-dot" style={{ background: r.dot }} />}{r.label}</th>
                  {cols.map((c) => <td key={c.key} className={c.key === 'total' ? 'is-total' : ''}>{c.key === 'meta' ? r.fmt(data.meta) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="wh-muted wh-small chn-note">
            {!data.meta?.connected
              ? 'Meta reported purchases: connect Meta (save the META_ADS_TOKEN key) to show Ads Manager’s own count here.'
              : data.meta.error
                ? 'Meta reported purchases: ' + data.meta.error
                : 'Meta reported purchases = Ads Manager’s count for the same dates (clicks and ad views, any device). Our Orders row counts only orders whose buyer arrived through a Meta ad link in the same browser, so Meta’s number is usually higher; the difference mostly shows up under Direct.'}
          </p>
        </div>
      )}
    </section>
  )
}
