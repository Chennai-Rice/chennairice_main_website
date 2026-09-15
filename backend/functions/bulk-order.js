// Vercel serverless function: POST /api/bulk-order — store a bulk order enquiry
import { buildBulkOrderRow, insertEnquiry } from '../lib/enquiries.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { row, error } = buildBulkOrderRow(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const stored = await insertEnquiry('bulk_order_enquiries', row)
    return res.status(200).json({ ok: true, stored })
  } catch (err) {
    console.error('Bulk order enquiry error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not save your enquiry.' })
  }
}
