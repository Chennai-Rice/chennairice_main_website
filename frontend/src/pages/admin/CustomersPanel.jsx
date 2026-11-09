import { useCallback, useState } from 'react'
import { CustomersView } from '../warehouse/OtherViews.jsx'
import StaffGate from './StaffGate.jsx'
import '../warehouse/warehouse.css'

/**
 * /admin → Customers (Nov 2026): the warehouse Customers page (converted or not, source, date range, CSV),
 * for the Analyst and Performance logins. Order counts and packs only, no money.
 */
export default function CustomersPanel() {
  const [error, setError] = useState('')
  const say = useCallback((message, tone) => { setError(tone === 'error' ? message : '') }, [])
  return (
    <StaffGate
      perm="customers.view"
      title="Sign in to see customers"
      why="The customer list carries names and phone numbers, so it needs your staff account."
      deniedText="This staff account cannot see the customer list."
    >
      {({ onAuthError }) => (
        <div className="wh-embed">
          {error && <p className="ad-alert" role="alert">{error}</p>}
          <CustomersView say={say} onAuthError={onAuthError} />
        </div>
      )}
    </StaffGate>
  )
}
