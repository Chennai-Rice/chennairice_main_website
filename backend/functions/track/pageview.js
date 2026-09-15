// Vercel serverless function: POST /api/track/pageview — record one page view.
import { insertPageview } from '../../lib/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { error, stored } = await insertPageview(req.body)
    if (error) return res.status(400).json({ error })
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Pageview tracking error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record pageview.' })
  }
}
