import { useCallback, useEffect, useState } from 'react'
import AnalystView from '../warehouse/AnalystView.jsx'
import StaffGate from './StaffGate.jsx'
import { staffJson } from '../../services/staffAuth.js'

/**
 * /admin → Analyst: the Sales Dashboard KPIs (sales, leads, campaigns,
 * delivery, CEO / MD numbers). Owner and IT team only, through the staff
 * Google sign-in that StaffGate asks for once.
 */
function Analyst({ onAuthError }) {
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const say = useCallback((message, tone) => { setError(tone === 'error' ? message : '') }, [])
  useEffect(() => { staffJson('/api/admin/me').then((me) => setName(me.fullName || '')).catch(() => {}) }, [])
  return (
    <div className="wh-embed">
      {error && <p className="ad-alert" role="alert">{error}</p>}
      <AnalystView say={say} onAuthError={onAuthError} name={name} />
    </div>
  )
}

export default function AnalystPanel() {
  return (
    <StaffGate
      perm="analyst.view"
      title="Sign in to see the Analyst dashboard"
      why="The Analyst dashboard includes sales figures, so it needs your staff Google account (owner or IT team)."
      deniedText="This staff account cannot open the Analyst dashboard. Sign in as the owner or the IT team."
    >
      {({ onAuthError }) => <Analyst onAuthError={onAuthError} />}
    </StaffGate>
  )
}
