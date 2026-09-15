// Vercel serverless function: POST /api/track/interactions — record a batch
// of clicks, rage clicks and dead clicks. Only ever called when the visitor
// has accepted the "analytics" cookie category (see
// src/services/interactions.js).
//
// Batched rather than one request per click: a browsing session produces
// perhaps two cart events and easily a hundred clicks, and one request each
// would be wasteful on a phone connection.
import { insertInteractions } from '../../lib/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { error, stored, skipped } = await insertInteractions(req.body)
    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, stored, skipped })
  } catch (err) {
    console.error('Interaction tracking error:', err)
    return res
      .status(err.status || 500)
      .json({ error: err.publicMessage || 'Could not record interactions.' })
  }
}
