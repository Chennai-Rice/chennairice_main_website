// Address suggestions at checkout (Nov 2026), from India Post's free post-office directory (api.postalpincode.in):
//   - a PIN code gives its city (district), state and the areas (post offices) it covers;
//   - a few letters of an area give matching areas with their city, state and PIN.
// The browser asks us, not India Post, so the site's privacy rules stay as they are and repeat lookups are cached.
// Suggestions only: a failure or a slow answer returns nothing and the customer just types.
import { str } from './util.js'

const BASE = 'https://api.postalpincode.in'
const TTL_MS = 24 * 3600 * 1000
const MAX_CACHE = 2000
const cache = new Map()

async function fetchJson(path, fetchImpl = fetch) {
  const hit = cache.get(path)
  if (hit && hit.at > Date.now() - TTL_MS) return hit.data
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetchImpl(BASE + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
    cache.set(path, { at: Date.now(), data })
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const offices = (data) => (Array.isArray(data) && data[0]?.Status === 'Success' && Array.isArray(data[0].PostOffice) ? data[0].PostOffice : [])
// "Anna Nagar (Chennai)" → "Anna Nagar"; "Velacheri S.O" → "Velacheri".
const cleanArea = (name) => str(name).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+(S\.?O|B\.?O|H\.?O)\.?$/i, '').trim()

/** A 6-digit PIN → { pin, city, state, areas[] }, or null. */
export async function pinInfo(pin, { fetchImpl } = {}) {
  const p = str(pin).replace(/\D/g, '')
  if (!/^[1-9]\d{5}$/.test(p)) return null
  const list = offices(await fetchJson(`/pincode/${p}`, fetchImpl))
  if (!list.length) return null
  return {
    pin: p,
    city: list[0].District || '',
    state: list[0].State || '',
    areas: [...new Set(list.map((o) => cleanArea(o.Name)).filter(Boolean))].slice(0, 30),
  }
}

/** A few letters of an area → up to 8 { area, city, state, pin } (state first if given). */
export async function searchAreas(q, { state, fetchImpl } = {}) {
  const term = str(q).replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40)
  if (term.length < 3) return []
  const list = offices(await fetchJson(`/postoffice/${encodeURIComponent(term)}`, fetchImpl))
  const want = str(state).trim().toLowerCase()
  const seen = new Set()
  return list
    .map((o) => ({ area: cleanArea(o.Name), city: o.District || '', state: o.State || '', pin: String(o.Pincode || '') }))
    .filter((o) => o.area && /^\d{6}$/.test(o.pin))
    .sort((a, b) => (want ? (b.state.toLowerCase() === want) - (a.state.toLowerCase() === want) : 0)
      || (b.area.toLowerCase().startsWith(term.toLowerCase())) - (a.area.toLowerCase().startsWith(term.toLowerCase())))
    .filter((o) => { const k = o.area + o.pin; if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 8)
}

export function _clearPlacesCache() { cache.clear() }
