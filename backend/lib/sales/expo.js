// Expo QR leads: the form at /expo, opened by scanning the QR code on the expo stand.
//
// Name, mobile, optional email, location, what the visitor is (distributor, HORECA,
// retailer or consumer) and the rice they need (raw rice, idly rice, boiled rice).
// Saved once per mobile number, then sent to the Sales Daddy CRM as a lead with the
// details in its note.
import { cleanMobile } from './attribution.js'
import { pushCrmLead } from '../crm.js'
import { httpError, str } from './util.js'

export const BUYER_TYPES = { distributor: 'Distributor', horeca: 'HORECA', retailer: 'Retailer', consumer: 'Consumer' }
export const REQUIREMENTS = { raw_rice: 'Raw rice', idly_rice: 'Idly rice', boiled_rice: 'Boiled rice' }

const NAME = /^[\p{L}][\p{L} .'-]{1,79}$/u
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

/** The form's answers checked and tidied, or a 400 whose message says what to fix. */
export function expoFields(body) {
  const name = str(body?.name).replace(/\s+/g, ' ')
  const phone = cleanMobile(body?.phone)
  const email = str(body?.email).toLowerCase()
  const location = str(body?.location).replace(/\s+/g, ' ')
  const buyerType = str(body?.buyerType)
  const wanted = Array.isArray(body?.requirements) ? body.requirements.map((r) => str(r)) : []
  const requirements = Object.keys(REQUIREMENTS).filter((k) => wanted.includes(k))
  const campaign = str(body?.campaign).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) || 'expo'

  if (!NAME.test(name)) throw httpError('Bad name', { publicMessage: 'Please enter your name.' })
  if (!phone) throw httpError('Bad phone', { publicMessage: 'Please enter a valid 10-digit mobile number.' })
  if (email && (email.length > 120 || !EMAIL.test(email))) throw httpError('Bad email', { publicMessage: 'That email address does not look right.' })
  if (location.length < 2 || location.length > 100) throw httpError('Bad location', { publicMessage: 'Please enter your city or area.' })
  if (!BUYER_TYPES[buyerType]) throw httpError('Bad type', { publicMessage: 'Please choose Distributor, HORECA, Retailer or Consumer.' })
  if (!requirements.length) throw httpError('Bad requirement', { publicMessage: 'Please choose the rice you need.' })
  return { name, phone, email, location, buyerType, requirements, campaign }
}

/** Saves one expo lead (a second submission from the same mobile updates it) and queues it for Sales Daddy. */
export async function saveExpoLead(db, body) {
  const f = expoFields(body)
  await db.query(
    `insert into expo_leads (name, phone, email, location, buyer_type, requirements, campaign)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (phone) do update set name = excluded.name, email = coalesce(excluded.email, expo_leads.email),
       location = excluded.location, buyer_type = excluded.buyer_type, requirements = excluded.requirements,
       campaign = excluded.campaign, submissions = expo_leads.submissions + 1, updated_at = now()`,
    [f.name, f.phone, f.email || null, f.location, f.buyerType, f.requirements, f.campaign]
  )
  const needs = f.requirements.map((k) => REQUIREMENTS[k]).join(', ')
  await pushCrmLead('expo_lead', {
    name: f.name,
    phone: f.phone,
    email: f.email || undefined,
    city: f.location,
    source: 'manual',
    note: [
      `Expo QR lead (${f.campaign}).`,
      `Customer type: ${BUYER_TYPES[f.buyerType]}`,
      `Needs: ${needs}`,
      `Location: ${f.location}`,
    ].join('\n'),
    custom: { came_from: 'Expo QR', expo: f.campaign, customer_type: BUYER_TYPES[f.buyerType], requirement: needs, location: f.location },
  })
  return { ok: true }
}

/** Expo leads, newest first, for the Reports page and its CSV. */
export async function listExpoLeads(db, { days = 90 } = {}) {
  const span = Math.min(366, Math.max(1, Number(days) || 90))
  const { rows } = await db.query(
    `select name, phone, email, location, buyer_type, requirements, campaign, submissions, created_at, updated_at
       from expo_leads where updated_at >= now() - ($1::int * interval '1 day') order by updated_at desc limit 5000`,
    [span]
  )
  return rows.map((r) => ({
    name: r.name, phone: r.phone, email: r.email || '', location: r.location,
    buyerType: BUYER_TYPES[r.buyer_type] || r.buyer_type,
    requirement: r.requirements.map((k) => REQUIREMENTS[k] || k).join(', '),
    campaign: r.campaign, submissions: r.submissions, at: r.updated_at,
  }))
}
