// Vercel serverless function: POST /api/track/heartbeat — periodic ping while
// a tracked visitor's tab is active, keeping total_seconds/last_seen_at current.
import { touchSession } from '../../lib/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sessionId, totalSeconds, pageCount } = req.body || {}

  try {
    const stored = await touchSession({ sessionId, totalSeconds, pageCount })
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Heartbeat error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not update session.' })
  }
}
