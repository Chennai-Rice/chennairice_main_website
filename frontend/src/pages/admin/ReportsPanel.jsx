import { useCallback, useEffect, useState } from 'react'
import { staffFetch, staffJson } from '../../services/staffAuth.js'
import { Card, LoadingRegion, Segmented } from './components/ui.jsx'
import StaffGate from './StaffGate.jsx'

/**
 * /admin → Reports: the website's own data as spreadsheets, one card per kind
 * (orders, customers, sign-ups, expo leads, enquiries, checkout journeys), for a
 * period of the owner's choice. They are CSV files for Excel and for feeding the
 * Business Advisor. The files carry names, phones and emails, so this needs the
 * staff sign-in of the owner or the IT team.
 */
const PERIODS = [
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: '365', label: 'Last year' },
]

export default function ReportsPanel() {
  return (
    <StaffGate
      perm="analyst.view"
      title="Sign in to download reports"
      why="Reports contain customers' names, phones and emails, so they need your staff Google account (owner or IT team)."
      deniedText="This staff account cannot download reports. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Reports onAuthError={onAuthError} />}
    </StaffGate>
  )
}

function Reports({ onAuthError }) {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    staffJson('/api/admin/reports')
      .then((d) => { setReports(d.reports); setError('') })
      .catch((err) => { if (!onAuthError(err)) setError(err.message || 'Could not load the reports.') })
  }, [onAuthError])
  useEffect(() => { load() }, [load])

  const [note, setNote] = useState('')

  async function syncNow() {
    setBusy('sync'); setError(''); setNote('')
    try {
      const r = await staffJson('/api/admin/settlements/sync', { method: 'POST', body: JSON.stringify({ days: 31 }) })
      setNote(r.skipped ? `Not done: ${r.skipped}.` : `Checked the last ${r.days} days: ${r.updated} payment(s) updated with their bank code.`)
    } catch (err) {
      if (!onAuthError(err)) setError(err.message || 'Could not ask Razorpay.')
    } finally {
      setBusy('')
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('import'); setError(''); setNote('')
    try {
      const r = await staffJson(`/api/admin/settlements/import?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      })
      setNote(`Read ${r.rows} rows: ${r.updated} payment(s) updated with their bank code${r.unknown ? `, ${r.unknown} not in our records` : ''}.`)
    } catch (err) {
      if (!onAuthError(err)) setError(err.message || 'Could not read that file.')
    } finally {
      setBusy('')
    }
  }

  async function download(report) {
    setBusy(report.id)
    setError('')
    try {
      const res = await staffFetch(`/api/admin/reports/${report.id}.csv?days=${days}`)
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `${report.id}.csv`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (!onAuthError(err)) setError(err.message || 'Could not download that report.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      {error && <p className="ad-alert" role="alert">{error}</p>}
      {!reports && !error && <LoadingRegion label="Loading reports" />}
      {reports && (
        <>
          <Card
            title="Download the website's data"
            subtitle="Each report is a CSV file that opens in Excel. Pick the period, then download."
            actions={<Segmented options={PERIODS} value={days} onChange={setDays} ariaLabel="Period" />}
          >
            <p className="ad-muted ad-small">
              The period applies to every report except Customers, which is always the full list. The files include
              personal details: keep them inside the team.
            </p>
          </Card>
          <Card
            title="Bank codes (UTIB)"
            subtitle="When Razorpay pays out, the bank's code of the transfer is added to each order automatically. Use these if you need to fill in earlier months."
            actions={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" className="ad-btn ad-btn-quiet" disabled={busy === 'sync'} onClick={syncNow}>
                  {busy === 'sync' ? 'Asking Razorpay…' : 'Update from Razorpay'}
                </button>
                <label className="ad-btn ad-btn-quiet" style={{ cursor: 'pointer' }}>
                  {busy === 'import' ? 'Reading the file…' : 'Upload Settlement Recon file'}
                  <input type="file" accept=".xlsx,.csv" hidden onChange={importFile} disabled={busy === 'import'} />
                </label>
              </div>
            }
          >
            <p className="ad-muted ad-small">
              The files in the Orders report and in Accounts → Invoices show a <strong>UTIB (bank reference)</strong> column.
              It is empty until Razorpay has paid the order out (about two days after payment).
            </p>
            {note && <p className="ad-notice" role="status">{note}</p>}
          </Card>
          <div className="ad-grid ad-grid-2">
            {reports.map((r) => (
              <Card key={r.id} title={r.label} subtitle={r.note}
                actions={
                  <button type="button" className="ad-btn ad-btn-quiet" disabled={busy === r.id}
                    onClick={() => download(r)}>
                    {busy === r.id ? 'Preparing…' : 'Download CSV'}
                  </button>
                }>
                <p className="ad-muted ad-small">{r.period ? PERIODS.find((p) => p.id === days)?.label : 'Everyone, all time'}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
