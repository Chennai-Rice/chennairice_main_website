import JournalPanel from './blog/JournalPanel.jsx'
import { LOCAL_AUTHOR } from '../services/blog.service.js'

/** Local test only (npm run dev): the journal writing tool without the staff sign-in, on the local test database. */
export default function DevJournalPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px 60px' }}>
      <p style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 8, background: '#fff4d6', color: '#5a4300', font: '14px system-ui' }}>
        Local test mode: posts and pictures are saved on this computer only (npm run blog:local), never to the live site.
      </p>
      <JournalPanel author={LOCAL_AUTHOR} />
    </div>
  )
}
