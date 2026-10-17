import { useCallback, useState } from 'react'
import SourcesReport from '../warehouse/SourcesReport.jsx'
import StaffGate from './StaffGate.jsx'

/**
 * /admin → Ad campaigns: the "Where orders come from" report from the
 * warehouse panel. Sales figures need a staff account with money access
 * (owner, admin or IT team), asked for once by StaffGate if needed.
 */
export default function CampaignsPanel() {
  const [error, setError] = useState('')
  const say = useCallback((message, tone) => { if (tone === 'error') setError(message) }, [])

  return (
    <StaffGate
      perm="money.view"
      title="Sign in to see sales"
      why="Ad results include order values, so they need your staff Google account (owner, admin or IT team)."
      deniedText="This staff account cannot see sales figures. Sign in as the owner, an admin or the IT team."
    >
      {({ onAuthError }) => (
        <div className="wh-embed">
          {error && <p className="ad-alert" role="alert">{error}</p>}
          <SourcesReport say={say} onAuthError={onAuthError} />
        </div>
      )}
    </StaffGate>
  )
}
