import { useCallback, useEffect, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Card, DataTable, LoadingRegion, Segmented } from './components/ui.jsx'

/**
 * /admin → Enquiries: what people sent from the Contact and Bulk order
 * forms on the website, newest first, with a status the team keeps up to
 * date (new → contacted → closed).
 */
const KINDS = [
  { id: 'contact', label: 'Contact' },
  { id: 'bulk', label: 'Bulk orders' },
]
const STATUSES = ['new', 'contacted', 'closed']

const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function EnquiriesPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('contact')

  const load = useCallback(() => {
    staffJson('/api/admin/enquiries')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err) => setError(err.message || 'Could not load enquiries.'))
  }, [])
  useEffect(() => { load() }, [load])

  async function setStatus(row, status) {
    setError('')
    try {
      const { enquiry } = await staffJson(`/api/admin/enquiries/${kind}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setData((d) => ({ ...d, [kind]: d[kind].map((r) => (r.id === enquiry.id ? enquiry : r)) }))
    } catch (err) {
      setError(err.message || 'Could not update that enquiry.')
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
      {data && (
        <Card
          title={kind === 'contact' ? 'Contact form' : 'Bulk order form'}
          subtitle={`${data[kind].filter((r) => r.status === 'new').length} new`}
          actions={<Segmented options={KINDS} value={kind} onChange={setKind} ariaLabel="Enquiry type" />}
        >
          <DataTable
            key={kind}
            rows={data[kind]}
            rowKey={(r) => r.id}
            searchable
            searchKeys={['name', 'company_or_name', 'representative_name', 'email', 'phone', 'enquiry', 'message']}
            searchPlaceholder="Search enquiries…"
            pageSize={25}
            emptyTitle="No enquiries yet"
            emptyNote="Messages sent from the website forms appear here."
            columns={columns}
          />
        </Card>
      )}
    </>
  )
}
