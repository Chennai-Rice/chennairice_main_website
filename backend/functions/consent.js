// Vercel serverless function: POST /api/consent  — record a cookie choice
//                             GET  /api/consent?id=… — read one back
//
// Storage is Upstash Redis over its REST API, configured through the Vercel
// project's Environment Variables (KV_REST_API_URL / KV_REST_API_TOKEN —
// a Vercel KV integration sets both for you). With neither set the endpoint
// still accepts and echoes the consent, it simply keeps no audit trail.
import {
  POLICY_VERSION,
  buildRecord,
  clientIp,
  hasStore,
  readRecord,
  saveRecord,
} from '../lib/consent.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const id = req.query?.id
    if (!id) {
      // No id given — report the policy the banner should be checking against.
      return res.status(200).json({ policyVersion: POLICY_VERSION, stored: hasStore })
    }
    try {
      const record = await readRecord(id)
      if (!record) return res.status(404).json({ error: 'No consent recorded for that id.' })
      return res.status(200).json({ consent: record })
    } catch (err) {
      console.error('Consent read error:', err)
      return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not read the consent record.' })
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { record, error } = buildRecord({
    body: req.body,
    ip: clientIp(req),
    userAgent: req.headers?.['user-agent'],
    now: Date.now(),
  })
  if (error) return res.status(400).json({ error })

  try {
    const stored = await saveRecord(record)
    return res.status(200).json({ consent: record, stored })
  } catch (err) {
    // The visitor's choice is already applied client-side, so a store
    // outage is logged and reported without pretending the click failed.
    console.error('Consent write error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Could not record the consent.' })
  }
}
