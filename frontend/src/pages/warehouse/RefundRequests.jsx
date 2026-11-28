import { useCallback, useEffect, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Icon } from './shared.jsx'

// Accounts → Refunds → Refund requests (owner, 28 Nov 2026): a refund is raised with a reason and a remark, then
// approved or not approved here. Approving sends the money back through Razorpay and issues the GST credit note,
// which is emailed to the customer with the refund and downloadable below.

const rupees = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const STATUS = { requested: 'Waiting for approval', approved: 'Approved', not_approved: 'Not approved' }
const FILTERS = [['requested', 'Waiting'], ['approved', 'Approved'], ['not_approved', 'Not approved'], ['', 'All']]

async function downloadPdf(id, say, onAuthError) {
  try {
    const res = await staffFetch(`/api/admin/credit-notes/${id}/pdf`)
    const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') || '')?.[1] || 'credit-note.pdf'
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

/** The "new refund request" form: find the order, then amount, reason, remark. */
function NewRequest({ reasons, say, fail, onDone, onClose }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [found, setFound] = useState(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(reasons[0] || '')
  const [other, setOther] = useState('')
  const [remark, setRemark] = useState('')
  const [cancel, setCancel] = useState(true)
  const [busy, setBusy] = useState(false)

  async function find(e) {
    e.preventDefault()
    if (!orderNumber.trim()) return
    setBusy(true)
    try {
      const r = await staffJson(`/api/admin/refund-requests/check?orderNumber=${encodeURIComponent(orderNumber.trim())}`)
      setFound(r)
      setAmount(String(r.refundable))
    } catch (err) { setFound(null); fail(err) } finally { setBusy(false) }
  }
  async function submit(e) {
    e.preventDefault()
    const why = reason === '__other' ? other.trim() : reason
    if (!why) { say('Please give a reason for the refund.', 'error'); return }
    setBusy(true)
    try {
      await staffJson('/api/admin/refund-requests', {
        method: 'POST',
        body: JSON.stringify({ orderId: found.orderId, amount, reason: why, remark, cancelOrder: found.canCancel && cancel }),
      })
      say(`Refund request for ${found.orderNumber} raised. It now waits for approval.`)
      onDone()
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const blocked = found && (found.openRequest || !(found.refundable > 0))
  return (
    <div className="wh-rr-form">
      <form className="wh-rr-find" onSubmit={find}>
        <label className="wh-filter"><span>Order number</span>
          <input className="wh-input" value={orderNumber} onChange={(e) => { setOrderNumber(e.target.value); setFound(null) }} placeholder="CR-20261107-AS7TP" autoFocus /></label>
        <button type="submit" className="wh-btn wh-btn--outline" disabled={busy || !orderNumber.trim()}><Icon name="search" size={16} /> Find order</button>
        <button type="button" className="wh-btn wh-btn--ghost" onClick={onClose}>Close</button>
      </form>
      {found && (
        <div className="wh-rr-order">
          <strong>{found.customer}</strong> · <span className="wh-mono">{found.orderNumber}</span>
          {found.invoiceNumber && <span className="wh-muted"> · Invoice {found.invoiceNumber}</span>}
          <br /><span className="wh-small">Paid {rupees(found.paid)} · can still be refunded <strong>{rupees(found.refundable)}</strong> · order {found.status.replace('_', ' ')}</span>
          {found.openRequest && <p className="wh-acc-bad wh-small">This order already has a refund request waiting for approval.</p>}
          {!found.openRequest && !(found.refundable > 0) && <p className="wh-acc-bad wh-small">Nothing left to refund on this order.</p>}
        </div>
      )}
      {found && !blocked && (
        <form className="wh-rr-fields" onSubmit={submit}>
          <label className="wh-filter"><span>Amount (₹)</span>
            <input className="wh-input" type="number" min="1" step="0.01" max={found.refundable} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
          <label className="wh-filter"><span>Reason</span>
            <span className="wh-select"><select value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="__other">Other…</option>
            </select></span></label>
          {reason === '__other' && (
            <label className="wh-filter"><span>Reason</span>
              <input className="wh-input" value={other} onChange={(e) => setOther(e.target.value)} maxLength={300} required /></label>
          )}
          <label className="wh-filter wh-rr-remark"><span>Remark</span>
            <textarea className="wh-input" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={2000}
              placeholder="e.g. Rice not in stock at the warehouse this week; customer informed by phone" /></label>
          {found.canCancel && (
            <label className="wh-rr-check"><input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
              Also cancel the order when approved (the bags go back into stock)</label>
          )}
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Raise refund request'}</button>
        </form>
      )}
    </div>
  )
}

export default function RefundRequests({ say, onAuthError, onChanged }) {
  const [filter, setFilter] = useState('requested')
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState(null) // { id, kind: 'approve' | 'reject' }
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const fail = useCallback((err) => { if (!onAuthError(err)) say(err.message, 'error') }, [onAuthError, say])
  const reload = () => { setTick((t) => t + 1); onChanged?.() }

  useEffect(() => {
    let live = true
    staffJson(`/api/admin/refund-requests?status=${filter}`).then((d) => live && setData(d)).catch(fail)
    return () => { live = false }
  }, [filter, tick, fail])

  async function decide(r) {
    setBusy(true)
    try {
      const res = await staffJson(`/api/admin/refund-requests/${r.id}/${deciding.kind}`, { method: 'POST', body: JSON.stringify({ note }) })
      say(deciding.kind === 'approve'
        ? `Approved: ${rupees(r.amount)} refunded to ${r.customer}${res.creditNote ? `, credit note ${res.creditNote.credit_note_number} issued and emailed` : ''}.${res.action ? ' ' + res.action : ''}`
        : `Not approved: nothing was refunded for ${r.orderNumber}.`)
      setDeciding(null)
      setNote('')
      reload()
    } catch (err) { fail(err); reload() } finally { setBusy(false) }
  }

  const c = data?.counts
  const rows = data?.requests
  return (
    <div className="wh-rr">
      <div className="wh-acc-head">
        <div>
          <h3 className="wh-panel-title" style={{ margin: 0 }}>Refund requests</h3>
          <p className="wh-muted wh-small" style={{ margin: '2px 0 0' }}>Approve to refund through Razorpay and issue the GST credit note; not approved refunds nothing.</p>
        </div>
        <div className="wh-rr-filters">
          {FILTERS.map(([k, label]) => (
            <button key={k || 'all'} type="button" className={`wh-tab${filter === k ? ' is-active' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}{c && k ? ` (${c[k]})` : ''}
            </button>
          ))}
          {!adding && <button type="button" className="wh-btn wh-btn--primary wh-btn--small" onClick={() => setAdding(true)}>+ New refund request</button>}
        </div>
      </div>
      {adding && data && <NewRequest reasons={data.reasons} say={say} fail={fail} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setFilter('requested'); reload() }} />}

      {!rows ? <p className="wh-empty">Loading…</p> : !rows.length ? <p className="wh-empty">No refund requests here.</p> : (
        <div className="wh-acc-table wh-acc-table--rr" role="table" aria-label="Refund requests">
          <div className="wh-acc-tr wh-acc-th" role="row">
            <span role="columnheader">Requested</span><span role="columnheader">Customer / order</span><span role="columnheader">Amount</span>
            <span role="columnheader">Reason &amp; remark</span><span role="columnheader">Status</span><span role="columnheader" />
          </div>
          {rows.map((r) => (
            <div key={r.id} className="wh-acc-tr" role="row">
              <span role="cell">{when(r.requestedAt)}{r.requestedBy && <><br /><span className="wh-muted wh-small">by {r.requestedBy}</span></>}</span>
              <span role="cell">{r.customer}<br /><span className="wh-muted wh-small wh-mono">{r.orderNumber}</span>
                {r.invoiceNumber && <span className="wh-muted wh-small"> · {r.invoiceNumber}</span>}
                <br /><span className="wh-muted wh-small">Order {r.orderStatus.replace('_', ' ')}{r.cancelOrder && r.status === 'requested' ? ' · will be cancelled on approval' : ''}</span></span>
              <span role="cell"><span className="wh-k">Amount</span><strong>{rupees(r.amount)}</strong><br /><span className="wh-muted wh-small">of {rupees(r.orderTotal)}</span></span>
              <span role="cell"><span className="wh-k">Reason</span><strong>{r.reason}</strong>{r.remark && <><br /><span className="wh-small">Remark: {r.remark}</span></>}</span>
              <span role="cell"><span className="wh-k">Status</span>
                <span className={`wh-acc-pill is-rr-${r.status}`}>{STATUS[r.status] || r.status}</span>
                {r.decidedBy && <><br /><span className="wh-muted wh-small">{r.decidedBy} · {when(r.decidedAt)}</span></>}
                {r.decisionNote && <><br /><span className="wh-small">“{r.decisionNote}”</span></>}
                {r.status === 'approved' && r.refundId && <><br /><span className="wh-mono wh-small">{r.refundId}</span></>}
                {r.lastError && r.status === 'requested' && <><br /><span className="wh-small wh-acc-bad">Last try failed: {r.lastError}</span></>}</span>
              <span role="cell" className="wh-acc-actions">
                {r.status === 'requested' && deciding?.id !== r.id && (
                  <>
                    <button type="button" className="wh-btn wh-btn--primary" onClick={() => { setDeciding({ id: r.id, kind: 'approve' }); setNote('') }}><Icon name="check" size={16} /> Approve</button>
                    <button type="button" className="wh-btn wh-btn--outline" onClick={() => { setDeciding({ id: r.id, kind: 'reject' }); setNote('') }}><Icon name="x" size={16} /> Not approve</button>
                  </>
                )}
                {r.creditNoteId && (
                  <button type="button" className="wh-btn wh-btn--outline" onClick={() => downloadPdf(r.creditNoteId, say, onAuthError)} title={r.creditNoteNumber}>
                    <Icon name="download" size={16} /> Credit note</button>
                )}
                {r.creditNoteNumber && <span className="wh-mono wh-small">{r.creditNoteNumber}</span>}
              </span>
              {deciding?.id === r.id && (
                <div className="wh-rr-decide">
                  <p className="wh-small" style={{ margin: 0 }}>
                    {deciding.kind === 'approve'
                      ? <>Refund <strong>{rupees(r.amount)}</strong> to {r.customer} now{r.cancelOrder ? ', cancel the order' : ''} and issue the credit note? This sends the money back and cannot be undone.</>
                      : <>Not approve this refund? Nothing is refunded. Say why:</>}
                  </p>
                  <input className="wh-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                    placeholder={deciding.kind === 'approve' ? 'Note (optional)' : 'Why it is not approved'} />
                  <div className="wh-acc-actions">
                    <button type="button" className={`wh-btn ${deciding.kind === 'approve' ? 'wh-btn--primary' : 'wh-btn--danger'}`}
                      disabled={busy || (deciding.kind === 'reject' && !note.trim())} onClick={() => decide(r)}>
                      {busy ? 'Working…' : deciding.kind === 'approve' ? 'Yes, refund and issue credit note' : 'Not approve'}</button>
                    <button type="button" className="wh-btn wh-btn--ghost" disabled={busy} onClick={() => setDeciding(null)}>Back</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
