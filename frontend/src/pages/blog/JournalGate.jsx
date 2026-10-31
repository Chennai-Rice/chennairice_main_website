import StaffGate from '../admin/StaffGate.jsx'
import JournalPanel from './JournalPanel.jsx'

// The byline on every post; the server sets it, this is only for the preview.
const AUTHOR = { display_name: 'Chennai Rice Industries' }

/** The writing tool behind the staff sign-in: owner, admin, IT team and the 'blog' writer role (blog.manage). */
export default function JournalGate() {
  return (
    <StaffGate
      perm="blog.manage"
      passwordSignIn
      title="Sign in to the Journal"
      why="The Journal is where blog posts are written and published. Sign in with your writer email and password, or with the owner's or an IT team Google account."
      deniedText="This account cannot write blog posts. Sign in with a writer login, or as the owner or the IT team."
    >
      {() => <JournalPanel author={AUTHOR} />}
    </StaffGate>
  )
}
