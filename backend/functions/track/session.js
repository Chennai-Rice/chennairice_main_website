// Vercel serverless function: POST /api/track/session — start a visitor session.
// Only ever called when the visitor has accepted the "analytics" cookie
// category (see src/hooks/useVisitorTracking.js).
import { buildSessionRow, insertSession } from '../../lib/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { row, error } = await buildSessionRow({ body: req.body, req })
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertSession(row)
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Session tracking error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not start session.' })
  }
}
