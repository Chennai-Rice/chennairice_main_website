// Where each payment landed in the bank — the "UTIB" code on every paid order.
//
// Razorpay pays out in batches (settlements) about two days after a payment. The bank statement shows only
// the bank's own reference of that transfer (UTIBN62026101710660349); Razorpay gives it as `additional_utr`
// in the settlement reconciliation, together with its own UTR (AXISCN…) and the settlement id. This writes
// them onto the payments, three ways:
//   - the `settlement.processed` webhook (webhooks.js) and the daily check (jobs.js) ask Razorpay for the
//     last few days (syncSettlements),
//   - or the monthly "Settlement Recon" file from Razorpay's Reports is uploaded (importSettlementFile).
// The Excel exports (Accounts invoice register, Reports → Orders) then show the code.
import { query } from '../db.js'
import { hasRazorpay, fetchSettlementRecon } from '../razorpay.js'
import { parseCsv } from './advisor-files.js'
import { httpError, str } from './util.js'

const istDay = (ms = Date.now()) => new Date(ms + 330 * 60000).toISOString().slice(0, 10)

/** A date from Razorpay's API (unix seconds) or from its file ("17/10/2026 13:13:51", India time, or ISO). */
function toDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number' || /^\d{9,11}$/.test(String(v))) return new Date(Number(v) * 1000)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(str(v))
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - 330 * 60000)
  const d = new Date(str(v))
  return Number.isNaN(d.getTime()) ? null : d
}

const paise = (v, units) => {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) && String(v ?? '') !== '' ? Math.round(units === 'rupees' ? n * 100 : n) : null
}

/**
 * Writes the settlement onto the payments in `rows` (Razorpay reconciliation rows: from the API in paise,
 * from the downloaded file in rupees). Returns how many payments were updated and how many rows were
 * payments of ours that were not found.
 */
export async function applySettlementRows(db, rows, { units = 'paise' } = {}) {
  let updated = 0
  let unknown = 0
  for (const r of rows) {
    const type = str(r.type || r.transaction_entity).toLowerCase()
    const paymentId = str(r.payment_id || (type === 'payment' ? r.entity_id : ''))
    const settlementId = str(r.settlement_id)
    if (!/^pay_/.test(paymentId) || !settlementId) continue // a refund, an adjustment, or not settled yet
    const { rowCount } = await db.query(
      `update payments
          set settlement_id = $2,
              settlement_utr = coalesce(nullif($3, ''), settlement_utr),
              bank_utr = coalesce(nullif($4, ''), bank_utr),
              settled_at = coalesce($5, settled_at),
              settlement_fee_paise = $6,
              settlement_tax_paise = $7
        where gateway = 'razorpay' and gateway_payment_id = $1
          and (settlement_id is distinct from $2 or bank_utr is distinct from coalesce(nullif($4, ''), bank_utr))`,
      [paymentId, settlementId, str(r.settlement_utr), str(r.additional_utr), toDate(r.settled_at),
        paise(r.fee ?? r['fee (exclusive tax)'], units), paise(r.tax, units)]
    )
    if (rowCount) updated += rowCount
    else {
      const { rows: [known] } = await db.query(`select 1 from payments where gateway = 'razorpay' and gateway_payment_id = $1`, [paymentId])
      if (!known) unknown += 1
    }
  }
  return { updated, unknown }
}

/** Asks Razorpay for the settlements paid out on each of the last `days` days and records them. */
export async function syncSettlements({ days = 4, db = { query } } = {}) {
  if (!hasRazorpay) return { skipped: 'Razorpay is not configured' }
  const span = Math.min(Math.max(Number(days) || 4, 1), 62)
  let fetched = 0
  let updated = 0
  let unknown = 0
  for (let back = 0; back < span; back++) {
    const [year, month, day] = istDay(Date.now() - back * 864e5).split('-').map(Number)
    for (let skip = 0; skip < 20000; skip += 1000) {
      const page = await fetchSettlementRecon({ year, month, day, skip, count: 1000 })
      const items = page.items || []
      fetched += items.length
      const done = await applySettlementRows(db, items, { units: 'paise' })
      updated += done.updated
      unknown += done.unknown
      if (items.length < 1000) break
    }
  }
  return { days: span, fetched, updated, unknown }
}

/** Reads the Settlement Recon file (.xlsx or .csv) into rows keyed by its column names. */
async function readRows(buffer, name) {
  const matrix = []
  if (/\.csv$/i.test(name)) matrix.push(...parseCsv(buffer.toString('utf8')))
  else {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    if (!ws) throw httpError('Empty workbook', { publicMessage: 'That Excel file has no data.' })
    const cell = (v) => (v && typeof v === 'object' ? (v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : '')) : v)
    ws.eachRow({ includeEmpty: false }, (row) => matrix.push((row.values || []).slice(1).map(cell)))
  }
  if (matrix.length < 2) throw httpError('No rows', { publicMessage: 'That file has no rows.' })
  const header = matrix[0].map((h) => str(h).toLowerCase())
  return matrix.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

/** The Settlement Recon file from Razorpay's Reports (amounts in rupees): its payments get their settlement. */
export async function importSettlementFile(db, { name, buffer }) {
  if (!buffer?.length) throw httpError('No file', { publicMessage: 'Choose the Settlement Recon file from Razorpay.' })
  const rows = await readRows(buffer, str(name))
  if (!rows.some((r) => 'settlement_id' in r)) {
    throw httpError('Not a recon file', { publicMessage: 'That is not Razorpay\'s Settlement Recon report (no settlement_id column).' })
  }
  return { rows: rows.length, ...(await applySettlementRows(db, rows, { units: 'rupees' })) }
}
