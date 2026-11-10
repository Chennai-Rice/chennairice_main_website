import { useCallback, useEffect, useState } from 'react'
import ChannelTable from '../warehouse/ChannelTable.jsx'
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
  { id: 'custom', label: 'Custom' },
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
  // Custom: From and To (India dates, both included).
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(new Date(Date.now() + 330 * 60000 - 6 * 864e5).toISOString().slice(0, 10))
  const [to, setTo] = useState(today)
  const periodQs = days === 'custom' ? `from=${from}&to=${to}` : `days=${days}`
  // The All-in-one table at the top follows the same period.
  const range = days === 'custom' ? { from, to } : { from: new Date(Date.now() + 330 * 60000 - (Number(days) - 1) * 864e5).toISOString().slice(0, 10), to: today }
  const periodLabel = days === 'custom' ? (from === to ? from : `${from} to ${to}`) : PERIODS.find((p) => p.id === days)?.label
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    staffJson('/api/admin/reports')
      .then((d) => { setReports(d.reports); setError('') })
      .catch((err) => { if (!onAuthError(err)) setError(err.message || 'Could not load the reports.') })
  }, [onAuthError])
  useEffect(() => { load() }, [load])

  async function download(report) {
    setBusy(report.id)
    setError('')
    try {
      const res = await staffFetch(`/api/admin/reports/${report.id}.csv?${periodQs}`)
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
              {days === 'custom' && (
                <span className="ad-report-dates">
                  <label>From <input type="date" className="ad-input" value={from} max={to} onChange={(e) => setFrom(e.target.value || from)} /></label>
                  <label>To <input type="date" className="ad-input" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || to)} /></label>
                  <br />
                </span>
              )}
              The period applies to every report except Customers, which is always the full list. The files include
              personal details: keep them inside the team.
            </p>
          </Card>
          <div className="wh-embed"><ChannelTable rq={`from=${range.from}&to=${range.to}`} range={range} say={(m, tone) => { if (tone === 'error') setError(m) }} onAuthError={onAuthError} /></div>
          <div className="ad-grid ad-grid-2">
            {reports.map((r) => (
              <Card key={r.id} title={r.label} subtitle={r.note}
                actions={
                  <button type="button" className="ad-btn ad-btn-quiet" disabled={busy === r.id}
                    onClick={() => download(r)}>
                    {busy === r.id ? 'Preparing…' : 'Download CSV'}
                  </button>
                }>
                <p className="ad-muted ad-small">{r.period ? periodLabel : 'Everyone, all time'}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}
