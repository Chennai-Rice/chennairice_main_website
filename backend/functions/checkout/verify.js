// Vercel serverless function: POST /api/checkout/verify
// Confirms what the Zoho widget reported — signature check plus an
// authoritative re-fetch of the session — and marks the order paid.
// See lib/checkout.js.
import { confirmCheckout } from '../../lib/checkout.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await confirmCheckout(req.body)
    return res.status(200).json(result)
  } catch (err) {
    console.error('Checkout verify error:', err)
    return res
      .status(err.status || 500)
      .json({ error: err.publicMessage || 'We could not confirm your payment.' })
  }
}
