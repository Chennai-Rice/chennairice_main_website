// Loads the numbers a WhatsApp campaign is sent to, so their replies are not sent to Sales Daddy as customer
// leads (askeva-inbound.js; for 30 days from the upload). Reads the retailer column of the campaign's Excel.
//
//   node db/import-campaign-contacts.js "D:\Diwali\retailers.xlsx"          counts the numbers, changes nothing
//   node db/import-campaign-contacts.js "D:\Diwali\retailers.xlsx" --apply  saves them
//   --campaign diwali_retailers   (default)
//
// The number column is the first heading with "retailer" and "mobile" in it, else the first with "mobile".
// Run it with the same database settings as db:migrate.
import ExcelJS from 'exceljs'
import { getPool, closePool } from '../lib/db.js'
import { crmMobile } from '../lib/crm.js'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--campaign')
const apply = args.includes('--apply')
const campaign = args.includes('--campaign') ? args[args.indexOf('--campaign') + 1] : 'diwali_retailers'
if (!file) {
  console.error('Give the Excel file: node db/import-campaign-contacts.js "D:\\Diwali\\retailers.xlsx" [--apply]')
  process.exit(1)
}

const text = (v) => (v && typeof v === 'object' ? (v.text ?? v.result ?? (v.richText || []).map((t) => t.text).join('')) : v ?? '').toString()

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const sheet = wb.worksheets[0]
const heads = Array.from(sheet.getRow(1).values || [], (h) => text(h).toLowerCase())
let col = heads.findIndex((h) => /retailer/.test(h) && /mobile|phone|number/.test(h))
if (col < 0) col = heads.findIndex((h) => /mobile|phone/.test(h))
if (col < 0) {
  console.error('No mobile column found in the first row:', heads.filter(Boolean).join(' | '))
  process.exit(1)
}
const mobiles = new Set()
let bad = 0
sheet.eachRow((row, n) => {
  if (n === 1) return
  const raw = text(row.getCell(col).value)
  if (!raw.trim()) return
  const m = crmMobile(raw)
  if (/^[6-9]\d{9}$/.test(m)) mobiles.add(m)
  else bad++
})
console.log(`Sheet "${sheet.name}", column "${heads[col]}": ${mobiles.size} numbers (${bad} not a valid mobile) for campaign ${campaign}.`)

if (!apply) {
  console.log('Nothing saved. Run again with --apply to save them.')
} else {
  try {
    const pool = await getPool()
    const list = [...mobiles]
    let saved = 0
    for (let i = 0; i < list.length; i += 1000) {
      const { rowCount } = await pool.query(
        `insert into campaign_contacts (mobile, campaign) select unnest($1::text[]), $2
         on conflict (mobile, campaign) do update set created_at = now()`, [list.slice(i, i + 1000), campaign])
      saved += rowCount
    }
    console.log(`Saved ${saved}. Their WhatsApp replies stay out of Sales Daddy for 30 days.`)
  } finally {
    await closePool()
  }
}
