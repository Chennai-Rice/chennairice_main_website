// Vercel serverless function: POST /api/chat
// Holds GROQ_API_KEY server-side (set it in the Vercel project's
// Environment Variables — never commit it). Deployed automatically by
// Vercel from this file's path; no extra routing config needed.
import { callGroq } from '../lib/soruKutty.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' })
  }

  const { messages } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' })
  }

  try {
    const reply = await callGroq({ apiKey: GROQ_API_KEY, model: GROQ_MODEL, messages })
    return res.status(200).json({ reply })
  } catch (err) {
    console.error('Chat function error:', err)
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Something went wrong talking to Soru Kutty.' })
  }
}
