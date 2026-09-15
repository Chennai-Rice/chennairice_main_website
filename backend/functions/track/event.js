// Vercel serverless function: POST /api/track/event — record a product or
// cart interaction. Only ever called when the visitor has accepted the
// "analytics" cookie category (see src/services/events.js).
import { insertEvent } from '../../lib/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { error, stored } = await insertEvent(req.body)
    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Event tracking error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record event.' })
  }
}
