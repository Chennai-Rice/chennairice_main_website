// The MIS dashboard's numbers, worked out in the browser from the sheet's rows (see backend/lib/sales/mis.js), so the
// brand / platform / month filters answer instantly.

export const STATUSES = ['Positively closed', 'Negatively closed', 'In Process', 'Open / Pending', 'Complaint']

// One soft colour per status (the reference dashboard's): the ring, legend and split bars use the colour, the chips
// use a tint of it with the darker ink.
export const STATUS_COLOR = {
  'Positively closed': '#8fdcb9',
  'Negatively closed': '#f4a3a3',
  'In Process': '#f7dc94',
  'Open / Pending': '#9cc3f4',
  Complaint: '#c9a9ee',
}
export const STATUS_INK = {
  'Positively closed': '#17714a',
  'Negatively closed': '#a23a3a',
  'In Process': '#85600b',
  'Open / Pending': '#245a92',
  Complaint: '#5f3fa3',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (ym) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '')
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : 'No date'
}

/** The rows that pass the three filters ('' means all). */
export function applyFilters(rows, { brand = '', platform = '', month = '' } = {}) {
  return rows.filter(
    (r) => (!brand || r.brand === brand) && (!platform || r.platform === platform) && (!month || (month === 'none' ? !r.month : r.month === month))
  )
}

/** The headline numbers for a set of rows. Conversion is positively closed over all leads. */
export function summarise(rows) {
  const by = (s) => rows.filter((r) => r.status === s).length
  const total = rows.length
  const positive = by('Positively closed')
  return {
    total,
    positive,
    negative: by('Negatively closed'),
    inProcess: by('In Process'),
    open: by('Open / Pending'),
    complaints: by('Complaint'),
    enquiries: rows.filter((r) => r.stage === 'Enquiry').length,
    conversion: total ? (positive / total) * 100 : 0,
  }
}

/** [{ label, count }] for one field, biggest first (months oldest first). */
export function countBy(rows, key) {
  const map = new Map()
  for (const r of rows) map.set(r[key], (map.get(r[key]) || 0) + 1)
  const list = [...map].map(([label, count]) => ({ label, count }))
  return key === 'month' ? list.sort((a, b) => String(a.label).localeCompare(String(b.label))) : list.sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)))
}

/** One summary row per value of a field (brand, telecaller, month, platform), biggest first. */
export function groupTable(rows, key) {
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r[key])) groups.set(r[key], [])
    groups.get(r[key]).push(r)
  }
  return [...groups].map(([label, list]) => ({ label, ...summarise(list) })).sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label)))
}

/** The biggest `n` groups, with the rest added up as "Others" (so a long list stays readable). */
export function topN(items, n = 8) {
  if (items.length <= n) return items
  const rest = items.slice(n - 1)
  return [...items.slice(0, n - 1), { label: 'Others', count: rest.reduce((a, b) => a + b.count, 0), muted: true }]
}

export const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) : '0.0')

/** CSV that opens in Excel: a BOM for Tamil and ₹, and a cell never runs as a formula. */
export function csvText(header, lines) {
  const cell = (v) => {
    let t = String(v ?? '')
    if (/^[=+\-@]/.test(t)) t = "'" + t
    return '"' + t.replace(/"/g, '""') + '"'
  }
  return '﻿' + [header, ...lines].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename, header, lines) {
  const url = URL.createObjectURL(new Blob([csvText(header, lines)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
