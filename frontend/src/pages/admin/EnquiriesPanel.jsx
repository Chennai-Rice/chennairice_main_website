import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Card, DataTable, LoadingRegion, MetricCard, Segmented } from './components/ui.jsx'
import StaffGate from './StaffGate.jsx'

/**
 * /admin → Enquiries: a dashboard of what people sent from the Contact and
 * Bulk order forms on the website — counts at the top, then the enquiries
 * newest first, with a status the team keeps up to date (new → contacted →
 * closed). Every enquiry also goes to the Sales Daddy CRM as a lead. Needs
 * the staff sign-in (owner, admin, IT team or sales).
 */
const KINDS = [
  { id: 'contact', label: 'Contact' },
  { id: 'bulk', label: 'Bulk orders' },
]
const STATUSES = ['new', 'contacted', 'closed']

// CSV for Excel: a BOM so Tamil and ₹ open correctly, and no cell may start
// like a formula.
function toCsv(header, lines) {
  const cell = (v) => {
    let t = String(v ?? '')
    if (/^[=+\-@]/.test(t)) t = "'" + t
    return '"' + t.replace(/"/g, '""') + '"'
  }
  return '\ufeff' + [header, ...lines].map((r) => r.map(cell).join(',')).join('\r\n')
}

function downloadCsv(kind, rows, show) {
  const istDay = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const csv = kind === 'contact'
    ? toCsv(['Received', 'Name', 'Email', 'Phone', 'Message', 'Status'],
        rows.map((r) => [when(r.created_at), r.name, r.email, r.phone, r.enquiry, r.status]))
    : toCsv(['Received', 'Company / name', 'Representative', 'Buyer type', 'Email', 'Phone', 'Quantity', 'GSTIN', 'Message', 'Status'],
        rows.map((r) => [when(r.created_at), r.company_or_name, r.representative_name,
          r.buyer_type === 'other' ? r.other_type || 'Other' : r.buyer_type, r.email, r.phone, r.quantity_kg, r.gstin, r.message, r.status]))
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${kind === 'contact' ? 'contact' : 'bulk-order'}-enquiries${show === 'all' ? '' : '-' + show}-${istDay}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'closed', label: 'Closed' },
]

export default function EnquiriesPanel() {
  return (
    <StaffGate
      perm="enquiries.view"
      title="Sign in to see enquiries"
      why="Enquiries carry customers' names, phones and emails, so they need your staff Google account (owner, admin, IT team or sales)."
      deniedText="This staff account cannot see enquiries. Sign in as the owner, an admin, the IT team or sales."
    >
      {({ onAuthError }) => <Enquiries onAuthError={onAuthError} />}
    </StaffGate>
  )
}

function Enquiries({ onAuthError }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('contact')
  const [show, setShow] = useState('all')

  const load = useCallback(() => {
    staffJson('/api/admin/enquiries')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => { if (!onAuthError(err)) setError(err.message || 'Could not load enquiries.') })
  }, [onAuthError])
  useEffect(() => { load() }, [load])

  // The counts follow any status change made here without a reload.
  const all = data ? [...data.contact, ...data.bulk] : []
  const counted = (st) => all.filter((e) => e.status === st).length
  const recent = (days) => all.filter((e) => Date.now() - new Date(e.created_at).getTime() < days * 864e5).length
  const rows = data ? data[kind].filter((r) => show === 'all' || r.status === show) : []

  async function setStatus(row, status) {
    setError('')
    try {
      const { enquiry } = await staffJson(`/api/admin/enquiries/${kind}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setData((d) => ({ ...d, [kind]: d[kind].map((r) => (r.id === enquiry.id ? enquiry : r)) }))
    } catch (err) {
      if (!onAuthError(err)) setError(err.message || 'Could not update that enquiry.')
    }
  }

  const statusCell = (row) => (
    <select className="ad-select" value={row.status} aria-label="Status" onChange={(e) => setStatus(row, e.target.value)}>
      {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
    </select>
  )
  const contactCell = (row) => (
    <span>
      <a className="ad-link" href={`mailto:${row.email}`}>{row.email}</a>
      <br />
      <a className="ad-link" href={`tel:${row.phone}`}>{row.phone}</a>
    </span>
  )

  const columns =
    kind === 'contact'
      ? [
          { key: 'created_at', header: 'Received', render: (r) => when(r.created_at), sortValue: (r) => r.created_at },
          { key: 'name', header: 'Name', render: (r) => <span className="ad-strong">{r.name}</span> },
          { key: 'email', header: 'Email / phone', render: contactCell, sortable: false },
          { key: 'enquiry', header: 'Message', render: (r) => <span style={{ whiteSpace: 'pre-wrap' }}>{r.enquiry}</span> },
          { key: 'status', header: 'Status', render: statusCell },
        ]
      : [
          { key: 'created_at', header: 'Received', render: (r) => when(r.created_at), sortValue: (r) => r.created_at },
          {
            key: 'company_or_name',
            header: 'Buyer',
            render: (r) => (
              <span>
                <span className="ad-strong">{r.company_or_name}</span>
                <br />
                <span className="ad-muted ad-small">
                  {r.representative_name} · {r.buyer_type === 'other' ? r.other_type || 'Other' : r.buyer_type}
                </span>
              </span>
            ),
          },
          { key: 'email', header: 'Email / phone', render: contactCell, sortable: false },
          { key: 'quantity_kg', header: 'Quantity', render: (r) => r.quantity_kg || '—' },
          { key: 'gstin', header: 'GSTIN', mono: true },
          { key: 'message', header: 'Message', render: (r) => <span style={{ whiteSpace: 'pre-wrap' }}>{r.message || '—'}</span> },
          { key: 'status', header: 'Status', render: statusCell },
        ]

  return (
    <>
      {error && <p className="ad-alert" role="alert">{error}</p>}
      {!data && !error && <LoadingRegion label="Loading enquiries" />}
      {data && !data.configured && (
        <p className="ad-notice">Enquiries are not connected on this copy of the website.</p>
      )}
      {data && (
        <>
          <div className="ad-kpis">
            <MetricCard label="New — not yet contacted" value={counted('new')} />
            <MetricCard label="Contacted" value={counted('contacted')} />
            <MetricCard label="Closed" value={counted('closed')} />
            <MetricCard label="Last 7 days" value={recent(7)} />
            <MetricCard label="Today" value={recent(1)} />
            <MetricCard label="Contact / Bulk order" value={`${data.contact.length} / ${data.bulk.length}`} />
          </div>
          <Card
            title={kind === 'contact' ? 'Contact form' : 'Bulk order form'}
            subtitle={`${data[kind].filter((r) => r.status === 'new').length} new · ${data[kind].length} in all`}
            actions={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Segmented options={KINDS} value={kind} onChange={setKind} ariaLabel="Enquiry type" />
                <Segmented options={FILTERS} value={show} onChange={setShow} ariaLabel="Status" />
                <button type="button" className="ad-btn ad-btn-quiet" disabled={!rows.length}
                  onClick={() => downloadCsv(kind, rows, show)} title="Download these enquiries for Excel">
                  Download CSV ({rows.length})
                </button>
              </div>
            }
          >
            <DataTable
              key={kind + show}
              rows={rows}
              rowKey={(r) => r.id}
              searchable
              searchKeys={['name', 'company_or_name', 'representative_name', 'email', 'phone', 'enquiry', 'message', 'gstin']}
              searchPlaceholder="Search name, phone, email, message…"
              pageSize={25}
              emptyTitle={show === 'all' ? 'No enquiries yet' : 'None with this status'}
              emptyNote="Messages sent from the website forms appear here."
              columns={columns}
            />
          </Card>
        </>
      )}
    </>
  )
}
