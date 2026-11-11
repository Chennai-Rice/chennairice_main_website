// The WhatsApp Business profile of +91 70666 46667 (what customers see when they tap the business name):
// photo, About, description, address, email, websites and category. Read and changed through the Cloud API
// from /whatsappbot → Settings → WhatsApp profile. Changes show on customers' phones within minutes.
import { httpError, str } from '../sales/util.js'
import { PHONE_ID, graph, uploadHeaderSample } from './cloud.js'

const FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical'
export const VERTICALS = ['GROCERY', 'RETAIL', 'RESTAURANT', 'OTHER']

// The suggested profile (Nov 2026): only facts from the website (address, email, FSSAI, Erode mill, 75 years).
export const SUGGESTED = {
  about: 'Kitchidi Ponni rice from our own mill in Erode 🍚 Order: chennairiceindustries.com',
  description: 'Chennai Rice Industries: makers of Kitchidi Ponni Rice and premium Ponni, idli and aged rice, milled at our fully automated facility in Erode with over 75 years of expertise. 5 kg to 26 kg packs, delivered to your door. Order online at chennairiceindustries.com, or message us here for prices, delivery to your PIN code, order tracking and bulk or wholesale orders. FSSAI Lic. 12415007000253.',
  address: 'SF No. 116/1,2,4-B, N. Thayirpalayam Village, Nasiyanur, Gangapuram Post, Erode, Tamil Nadu – 638102',
  email: 'support@chennairiceindustries.com',
  websites: ['https://chennairiceindustries.com/', 'https://chennairiceindustries.com/rice-products'],
  vertical: 'GROCERY',
}

export async function getProfile({ fetchImpl } = {}) {
  const d = await graph(`/${PHONE_ID()}/whatsapp_business_profile`, { fetchImpl, query: { fields: FIELDS } })
  const p = d.data?.[0] || {}
  return {
    about: p.about || '', description: p.description || '', address: p.address || '', email: p.email || '',
    websites: p.websites || [], vertical: p.vertical || '', photo: p.profile_picture_url || null,
    suggested: SUGGESTED,
  }
}

/** Checks and saves the text fields (and a new photo when `photoHandle` is given). */
export async function saveProfile(input = {}, { fetchImpl } = {}) {
  const about = str(input.about)
  const description = String(input.description || '').trim()
  const address = str(input.address)
  const email = str(input.email)
  const websites = (Array.isArray(input.websites) ? input.websites : []).map(str).filter(Boolean)
  const vertical = str(input.vertical).toUpperCase() || 'GROCERY'
  if (about.length < 1 || about.length > 139) throw httpError('About', { publicMessage: 'About must be 1 to 139 characters.' })
  if (description.length > 512) throw httpError('Description', { publicMessage: 'The description can be 512 characters at most.' })
  if (address.length > 256) throw httpError('Address', { publicMessage: 'The address can be 256 characters at most.' })
  if (email && (email.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw httpError('Email', { publicMessage: 'Enter a valid email address.' })
  if (websites.length > 2) throw httpError('Websites', { publicMessage: 'WhatsApp allows 2 websites at most.' })
  if (websites.some((w) => !/^https?:\/\/\S+$/.test(w) || w.length > 256)) throw httpError('Websites', { publicMessage: 'Websites must start with https://' })
  if (!VERTICALS.includes(vertical)) throw httpError('Vertical', { publicMessage: 'Choose a category.' })
  await graph(`/${PHONE_ID()}/whatsapp_business_profile`, {
    method: 'POST', fetchImpl,
    body: {
      messaging_product: 'whatsapp', about, description, address, email, websites, vertical,
      ...(input.photoHandle ? { profile_picture_handle: input.photoHandle } : {}),
    },
  })
  return getProfile({ fetchImpl })
}

/** A new profile photo (JPG or PNG, square, at least 192 × 192; 640 × 640 is best). */
export async function setProfilePhoto(buffer, mimeType, { fetchImpl } = {}) {
  if (!['image/jpeg', 'image/png'].includes(mimeType)) throw httpError('Type', { publicMessage: 'Use a JPG or PNG picture.' })
  if (!buffer?.length || buffer.length > 5 * 1024 * 1024) throw httpError('Size', { publicMessage: 'The picture must be under 5 MB.' })
  const handle = await uploadHeaderSample(buffer, mimeType, { fetchImpl })
  await graph(`/${PHONE_ID()}/whatsapp_business_profile`, { method: 'POST', fetchImpl, body: { messaging_product: 'whatsapp', profile_picture_handle: handle } })
  return getProfile({ fetchImpl })
}
