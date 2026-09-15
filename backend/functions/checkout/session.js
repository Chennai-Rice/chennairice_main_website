// Vercel serverless function: POST /api/checkout/session
// Prices the posted cart, records a pending order, and returns the Zoho
// payments_session_id for the browser widget to open. See lib/checkout.js.
import { createCheckoutSession } from '../../lib/checkout.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const session = await createCheckoutSession(req.body)
    return res.status(200).json({ ok: true, ...session })
  } catch (err) {
    console.error('Checkout session error:', err)
    return res
      .status(err.status || 500)
      .json({ error: err.publicMessage || 'We could not start your order. Please try again.' })
  }
}
