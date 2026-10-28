import { useCallback, useEffect, useMemo, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Icon, dayLabel, istDay } from './shared.jsx'

// Accounts: every invoice issued, payments received, refunds, and the totals
// for a period — for the accounts team. Read-only; no GST breakdown here.

const rupees = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

/** Indian financial year start (1 April) for a YYYY-MM-DD day. */
function fyStart(day) {
  const [y, m] = day.split('-').map(Number)
  return `${m >= 4 ? y : y - 1}-04-01`
}
function presets() {
  const today = istDay(0)
  const first = today.slice(0, 8) + '01'
  const lastMonthEnd = new Date(Date.parse(first + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10)
  return [
    { id: 'month', label: 'This month', from: first, to: today },
    { id: 'last', label: 'Last month', from: lastMonthEnd.slice(0, 8) + '01', to: lastMonthEnd },
    { id: 'fy', label: 'This financial year', from: fyStart(today), to: today },
    { id: 'custom', label: 'Custom dates' },
  ]
}

const PAY_STATUS = { paid: 'Paid', failed: 'Failed', created: 'Not completed', superseded: 'Replaced' }
const REFUND_STATUS = { pending: 'Pending', processed: 'Refunded', failed: 'Failed', manual: 'Refunded (manual)' }

async function download(path, fallback, say, onAuthError) {
  try {
    const res = await staffFetch(path)
    const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') || '')?.[1] || fallback
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    if (!onAuthError(err)) say(err.message, 'error')
  }
}

/** The invoice page (needs the staff sign-in), opened in a new tab. */
async function viewInvoice(orderId, say, onAuthError) {
  const tab = window.open('', '_blank')
  try {
    const res = await staffFetch(`/api/admin/orders/${orderId}/invoice`)
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }))
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    if (!onAuthError(err)) say(err.message, 'error')
  }
}

export default function AccountsView({ say, onAuthError }) {
  const options = useMemo(presets, [])
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: options[0].from, to: options[0].to })
  const range = preset === 'custom' ? custom : options.find((o) => o.id === preset)
  const qs = `from=${range.from}&to=${range.to}`
  const [tab, setTab] = useState('invoices')
  const [q, setQ] = useState('')
  const [payStatus, setPayStatus] = useState('paid')
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState(null)

  const fail = useCallback((err) => { if (!onAuthError(err)) say(err.message, 'error') }, [onAuthError, say])

  useEffect(() => {
    setSummary(null)
    staffJson(`/api/admin/accounts/summary?${qs}`).then(setSummary).catch(fail)
  }, [qs, fail])

  useEffect(() => {
    let live = true
    setRows(null)
    const path = tab === 'invoices' ? `invoices?${qs}&q=${encodeURIComponent(q)}`
      : tab === 'payments' ? `payments?${qs}&status=${payStatus}` : `refunds?${qs}`
    const t = window.setTimeout(() => {
      staffJson('/api/admin/accounts/' + path)
        .then((d) => live && setRows(d.invoices || d.payments || d.refunds || []))
        .catch(fail)
    }, tab === 'invoices' && q ? 300 : 0)
    return () => { live = false; window.clearTimeout(t) }
  }, [tab, qs, q, payStatus, fail])

  const s = summary
  return (
    <div className="wh-acc">
      <div className="wh-report-bar wh-acc-bar">
        <label className="wh-filter">
          <span>Period</span>
          <span className="wh-select">
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </span>
        </label>
        {preset === 'custom' && (
          <>
            <label className="wh-filter"><span>From</span>
              <input className="wh-input" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
            <label className="wh-filter"><span>To</span>
              <input className="wh-input" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
          </>
        )}
        <span className="wh-muted wh-small wh-acc-range">{dayLabel(range.from + 'T06:00:00Z').text} – {dayLabel(range.to + 'T06:00:00Z').text}</span>
        <button type="button" className="wh-btn wh-btn--outline" onClick={() => download(`/api/admin/accounts/invoices.csv?${qs}`, 'invoice-register.csv', say, onAuthError)}>
          <Icon name="download" size={18} /> Invoice register (CSV)
        </button>
      </div>

      <section className="wh-kpis wh-kpis--compact">
        <div className="wh-kpi wh-kpi--green"><span className="wh-kpi-icon"><Icon name="check" size={24} /></span>
          <span className="wh-kpi-text"><strong>{s ? rupees(s.received) : '—'}</strong><span className="wh-kpi-label">Payments received</span>
            <span className="wh-kpi-note">{s ? `${s.byMethod.reduce((t, m) => t + m.payments, 0)} payments` : ''}</span></span></div>
        <div className="wh-kpi wh-kpi--blue"><span className="wh-kpi-icon"><Icon name="orders" size={24} /></span>
          <span className="wh-kpi-text"><strong>{s ? rupees(s.invoiced) : '—'}</strong><span className="wh-kpi-label">Invoiced</span>
            <span className="wh-kpi-note">{s ? `${s.invoices} invoices` : ''}</span></span></div>
        <div className="wh-kpi wh-kpi--rose"><span className="wh-kpi-icon"><Icon name="undo" size={24} /></span>
          <span className="wh-kpi-text"><strong>{s ? rupees(s.refunded) : '—'}</strong><span className="wh-kpi-label">Refunded</span>
            <span className="wh-kpi-note">{s ? `${s.refunds} refunds${s.openRefunds ? ` · ${s.openRefunds} pending` : ''} · net ${rupees(s.net)}` : ''}</span></span></div>
      </section>

      {s && (
        <div className="wh-acc-split">
          <section className="wh-panel">
            <h2 className="wh-panel-title">Payments by method</h2>
            <p className="wh-muted wh-small">Razorpay payments received in this period.</p>
            {s.byMethod.length ? (
              <table className="wh-acc-mini">
                <thead><tr><th>Method</th><th>Payments</th><th>Amount</th></tr></thead>
                <tbody>{s.byMethod.map((m) => <tr key={m.method}><td>{m.method}</td><td>{m.payments}</td><td>{rupees(m.amount)}</td></tr>)}</tbody>
              </table>
            ) : <p className="wh-empty">No payments in this period.</p>}
            {s.paidWithoutInvoice > 0 && (
              <p className="wh-small wh-acc-note">{s.paidWithoutInvoice} paid {s.paidWithoutInvoice === 1 ? 'order has' : 'orders have'} no invoice number yet — it is issued when the order is confirmed.</p>
            )}
          </section>
        </div>
      )}

      <section className="wh-panel">
        <div className="wh-acc-head">
          <nav className="wh-tabs" aria-label="Accounts">
            {[['invoices', 'Invoices'], ['payments', 'Payments'], ['refunds', 'Refunds']].map(([k, label]) => (
              <button key={k} type="button" className={`wh-tab${tab === k ? ' is-active' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>
          {tab === 'invoices' && (
            <label className="wh-search wh-acc-search">
              <Icon name="search" size={17} />
              <span className="visually-hidden">Search invoices</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no, order no, customer or pay_…" />
            </label>
          )}
          {tab === 'payments' && (
            <label className="wh-filter"><span>Status</span>
              <span className="wh-select"><select value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                <option value="paid">Paid</option><option value="failed">Failed</option><option value="created">Not completed</option><option value="">All</option>
              </select></span></label>
          )}
        </div>

        {!rows ? <p className="wh-empty">Loading…</p> : !rows.length ? <p className="wh-empty">Nothing in this period.</p> : tab === 'invoices' ? (
          <div className="wh-acc-table wh-acc-table--inv" role="table" aria-label="Invoices">
            <div className="wh-acc-tr wh-acc-th" role="row">
              <span role="columnheader">Invoice</span><span role="columnheader">Customer / order</span>
              <span role="columnheader">Total</span><span role="columnheader">Payment</span><span role="columnheader" />
            </div>
            {rows.map((r) => (
              <div key={r.invoiceNumber} className="wh-acc-tr" role="row">
                <span role="cell"><strong className="wh-mono">{r.invoiceNumber}</strong><br /><span className="wh-muted wh-small">{when(r.issuedAt)}</span></span>
                <span role="cell">{r.customer}<br /><span className="wh-muted wh-small wh-mono">{r.orderNumber}</span> <span className="wh-muted wh-small">· {r.placeOfSupply}</span><br /><span className="wh-muted wh-small">{r.items}</span></span>
                <span role="cell"><span className="wh-k">Total</span><strong>{rupees(r.total)}</strong>{r.refunded > 0 && <><br /><span className="wh-small wh-acc-bad">Refunded {rupees(r.refunded)}</span></>}</span>
                <span role="cell"><span className="wh-k">Payment</span>{r.method || '—'}<br /><span className="wh-mono wh-small">{r.paymentId || '—'}</span>{r.bankUtr ? <><br /><span className="wh-mono wh-small" title="The bank's reference of the Razorpay payout — what the bank statement shows">UTIB {r.bankUtr}</span></> : null}</span>
                <span role="cell" className="wh-acc-actions">
                  <button type="button" className="wh-btn wh-btn--outline" onClick={() => viewInvoice(r.orderId, say, onAuthError)}><Icon name="eye" size={16} /> View</button>
                  <button type="button" className="wh-btn wh-btn--outline" onClick={() => download(`/api/admin/orders/${r.orderId}/invoice.pdf`, 'invoice.pdf', say, onAuthError)}><Icon name="download" size={16} /> PDF</button>
                </span>
              </div>
            ))}
          </div>
        ) : tab === 'payments' ? (
          <div className="wh-acc-table wh-acc-table--pay" role="table" aria-label="Payments">
            <div className="wh-acc-tr wh-acc-th" role="row">
              <span role="columnheader">When</span><span role="columnheader">Customer / order</span><span role="columnheader">Amount</span>
              <span role="columnheader">Method</span><span role="columnheader">Razorpay IDs</span><span role="columnheader">Status</span>
            </div>
            {rows.map((p) => (
              <div key={p.gatewayOrderId + p.status + p.at} className="wh-acc-tr" role="row">
                <span role="cell">{when(p.at)}</span>
                <span role="cell">{p.customer}<br /><span className="wh-muted wh-small wh-mono">{p.orderNumber}</span>{p.invoiceNumber && <span className="wh-muted wh-small"> · {p.invoiceNumber}</span>}</span>
                <span role="cell"><span className="wh-k">Amount</span><strong>{rupees(p.amount)}</strong></span>
                <span role="cell"><span className="wh-k">Method</span>{p.method || '—'}{p.cardLast4 && <span className="wh-muted wh-small"> ••{p.cardLast4}</span>}</span>
                <span role="cell"><span className="wh-k">IDs</span><span className="wh-mono wh-small">{p.paymentId || '—'}<br /><span className="wh-muted">{p.gatewayOrderId}</span>{p.bankUtr ? <><br />UTIB {p.bankUtr}</> : null}</span></span>
                <span role="cell"><span className={`wh-acc-pill is-${p.status}`}>{PAY_STATUS[p.status] || p.status}</span>{p.failure && <><br /><span className="wh-muted wh-small">{p.failure}</span></>}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="wh-acc-table wh-acc-table--ref" role="table" aria-label="Refunds">
            <div className="wh-acc-tr wh-acc-th" role="row">
              <span role="columnheader">When</span><span role="columnheader">Customer / order</span><span role="columnheader">Amount</span>
              <span role="columnheader">Reason</span><span role="columnheader">Razorpay IDs</span><span role="columnheader">Status</span>
            </div>
            {rows.map((r) => (
              <div key={r.at + r.orderNumber} className="wh-acc-tr" role="row">
                <span role="cell">{when(r.at)}{r.by && <><br /><span className="wh-muted wh-small">by {r.by}</span></>}</span>
                <span role="cell">{r.customer}<br /><span className="wh-muted wh-small wh-mono">{r.orderNumber}</span>{r.invoiceNumber && <span className="wh-muted wh-small"> · {r.invoiceNumber}</span>}</span>
                <span role="cell"><span className="wh-k">Amount</span><strong>{rupees(r.amount)}</strong></span>
                <span role="cell"><span className="wh-k">Reason</span>{r.reason}</span>
                <span role="cell"><span className="wh-k">IDs</span><span className="wh-mono wh-small">{r.refundId || '—'}<br /><span className="wh-muted">{r.paymentId}</span></span></span>
                <span role="cell"><span className={`wh-acc-pill is-${r.status}`}>{REFUND_STATUS[r.status] || r.status}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
