// Vercel serverless function: POST /api/contact — store a contact-page enquiry
import { buildContactRow, insertEnquiry } from '../lib/enquiries.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { row, error } = buildContactRow(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertEnquiry('contact_enquiries', row)
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Contact enquiry error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not save your enquiry.' })
  }
}
