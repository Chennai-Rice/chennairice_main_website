// A CSV or Excel (.xlsx) file of people for a broadcast: the first row is the column names, every other
// row one person. Returns { columns, rows } with each row as { column name: text }.
import ExcelJS from 'exceljs'
import { httpError } from '../sales/util.js'

export const MAX_ROWS = 20000

/** Any Excel cell as plain text (rich text, links, formulas, dates, numbers). */
function cellText(v) {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return String(v.text ?? '')
    if ('result' in v) return cellText(v.result)
    return ''
  }
  // A mobile number Excel turned into a number (9876543210 or 919876543210) stays whole.
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  return String(v)
}

/** CSV text to rows of cells: quotes, "" inside quotes, new lines inside quotes; , ; or tab. */
export function parseCsv(text) {
  const t = String(text).replace(/^﻿/, '')
  const first = t.split(/\r?\n/, 1)[0] || ''
  const sep = [',', ';', '\t'].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const out = []
  let row = []
  let cell = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((x) => String(x).trim() !== ''))
}

async function xlsxRows(buffer) {
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buffer) } catch { throw httpError('Bad file', { publicMessage: 'Could not read this Excel file. Save it as .xlsx (or CSV) and try again.' }) }
  const ws = wb.worksheets.find((s) => s.actualRowCount > 0)
  if (!ws) return []
  const out = []
  ws.eachRow({ includeEmpty: false }, (r) => {
    const cells = []
    for (let i = 1; i <= ws.columnCount; i++) cells.push(cellText(r.getCell(i).value).trim())
    if (cells.some(Boolean)) out.push(cells)
  })
  return out
}

/** The file's columns and people. `fileName` tells CSV from Excel when the type does not. */
export async function parseSheet(buffer, fileName = '') {
  if (!buffer?.length) throw httpError('Empty', { publicMessage: 'The file is empty.' })
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b // a .xlsx is a zip ("PK")
  if (/\.xls$/i.test(fileName) && !isXlsx) throw httpError('Old Excel', { publicMessage: 'This is an old .xls file. In Excel choose Save as → Excel Workbook (.xlsx) or CSV, then upload that.' })
  const cells = isXlsx ? await xlsxRows(buffer) : parseCsv(buffer.toString('utf8'))
  if (cells.length < 2) throw httpError('No rows', { publicMessage: 'The file needs a first row of column names (e.g. Name, Mobile) and at least one person below it.' })
  const seen = new Map()
  const columns = cells[0].map((h, i) => {
    let name = String(h || '').trim() || `Column ${i + 1}`
    const n = (seen.get(name) || 0) + 1
    seen.set(name, n)
    if (n > 1) name = `${name} (${n})`
    return name
  })
  if (cells.length - 1 > MAX_ROWS) throw httpError('Too many', { publicMessage: `A file can have up to ${MAX_ROWS.toLocaleString('en-IN')} people. Split it into smaller files.` })
  const rows = cells.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, String(r[i] ?? '').trim().slice(0, 500)])))
  return { columns, rows }
}

/** The column that holds the mobile number, and the one with the name (by heading, then by content). */
export function guessColumns(columns, rows) {
  const by = (re) => columns.find((c) => re.test(c))
  const mobileLike = (v) => /^[6-9]\d{9}$/.test(String(v).replace(/\D/g, '').slice(-10))
  const phone = by(/mobile|phone|whats\s*app|contact|number|cell/i) ||
    columns.find((c) => rows.slice(0, 50).filter((r) => mobileLike(r[c])).length >= Math.min(25, Math.ceil(rows.slice(0, 50).length / 2))) || ''
  const name = by(/^\s*(customer\s*)?name\s*$/i) || by(/name/i) || ''
  return { phone, name: name === phone ? '' : name }
}
