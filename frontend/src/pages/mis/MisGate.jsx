import StaffGate from '../admin/StaffGate.jsx'
import MisDashboard from './MisDashboard.jsx'

/** The MIS dashboard inside /admin for the owner, admin and IT team (mis.view), behind the staff sign-in. */
export default function MisGate() {
  return (
    <StaffGate
      perm="mis.view"
      passwordSignIn
      title="Sign in to the MIS dashboard"
      why="The MIS dashboard shows the leads from the MIS Google Sheet. Sign in with the MIS email and password, or with the owner's or an IT team Google account."
      deniedText="This account cannot open the MIS dashboard."
    >
      {() => <MisDashboard />}
    </StaffGate>
  )
}
