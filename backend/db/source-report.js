// Visits, sign-ups and revenue by source (Meta Ads, Google Ads, WhatsApp…) for a period, from the live database.
// Read only: nothing is changed.
//
//   node db/source-report.js 2026-11-01 2026-11-06     (India dates, both included; default: this month to today)
//
// Prints one table and saves D:\Reports\report_<from>_<to>.xlsx. Revenue is paid orders that were not cancelled or
// returned (as on the Analyst page). The company's own number and test entries ("Test …") are left out.
// Run it with the same database settings as db:migrate.
import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { getPool, closePool } from '../lib/db.js'

const IST = 330 * 60000
const today = new Date(Date.now() + IST).toISOString().slice(0, 10)
const [from = today.slice(0, 8) + '01', to = today] = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
const fromTs = new Date(Date.parse(from + 'T00:00:00Z') - IST)
const toTs = new Date(Date.parse(to + 'T00:00:00Z') - IST + 86400000)
const OWN = '9894006032'
const ten = (col) => `right(regexp_replace(coalesce(${col}, ''), '\\D', '', 'g'), 10)`

// The website's source keys, put together into the channels the owner reports on.
const GROUP = {
  meta_ads_facebook: 'Meta Ads', meta_ads_instagram: 'Meta Ads', meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook / Instagram (not ads)', instagram: 'Facebook / Instagram (not ads)',
  google_search: 'Google search',
  expo: 'Expo QR',
  other_website: 'Other websites',
}
const ORDER = ['Meta Ads', 'Google Ads', 'WhatsApp', 'Facebook / Instagram (not ads)', 'Google search', 'Expo QR', 'Other websites', 'Direct']
const group = (s) => GROUP[s] || 'Direct'

const pool = await getPool()
try {
  const q = async (sql, params) => (await pool.query(sql, params)).rows
  const visits = await q(`select source, sum(visits)::int n from traffic_visits where day between $1::date and $2::date group by 1`, [from, to])
  const signups = await q(`select source, count(*)::int n from contest_leads
    where created_at >= $1 and created_at < $2 and ${ten('phone')} <> '${OWN}' and name !~* '^test' group by 1`, [fromTs, toTs])
  const orders = await q(`select coalesce(traffic_source, 'direct') source, count(*)::int n, sum(total_paise)::bigint paise from orders
    where placed_at >= $1 and placed_at < $2 and payment_status in ('paid', 'partially_refunded') and status not in ('cancelled', 'returned')
      and ${ten('contact_phone')} <> '${OWN}' and contact_name !~* '^test' group by 1`, [fromTs, toTs])

  const rows = Object.fromEntries(ORDER.map((g) => [g, { Source: g, Visits: 0, 'Sign-ups': 0, 'Paid orders': 0, 'Revenue ₹': 0 }]))
  for (const r of visits) rows[group(r.source)].Visits += r.n
  for (const r of signups) rows[group(r.source)]['Sign-ups'] += r.n
  for (const r of orders) {
    rows[group(r.source)]['Paid orders'] += r.n
    rows[group(r.source)]['Revenue ₹'] += Math.round(Number(r.paise)) / 100
  }
  const table = Object.values(rows)
  const total = { Source: 'TOTAL', Visits: 0, 'Sign-ups': 0, 'Paid orders': 0, 'Revenue ₹': 0 }
  for (const r of table) for (const k of ['Visits', 'Sign-ups', 'Paid orders', 'Revenue ₹']) total[k] += r[k]
  table.push(total)

  console.log(`\nChennai Rice: ${from} to ${to}\n`)
  console.table(table.map((r) => ({ ...r, 'Revenue ₹': r['Revenue ₹'].toLocaleString('en-IN') })))

  fs.mkdirSync('D:/Reports', { recursive: true })
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('By source')
  ws.addRow([`Chennai Rice: ${from} to ${to}`]).font = { bold: true, size: 13 }
  ws.addRow([])
  ws.addRow(['Source', 'Visits', 'Sign-ups', 'Paid orders', 'Revenue ₹']).font = { bold: true }
  for (const r of table) {
    const row = ws.addRow([r.Source, r.Visits, r['Sign-ups'], r['Paid orders'], r['Revenue ₹']])
    if (r.Source === 'TOTAL') row.font = { bold: true }
  }
  ws.getColumn(1).width = 34
  for (const c of [2, 3, 4, 5]) ws.getColumn(c).width = 14
  ws.getColumn(5).numFmt = '#,##,##0'
  ws.addRow([])
  ws.addRow(['Visits = arrivals from ad links, WhatsApp links and other websites. People who typed the address are not counted.'])
  const out = `D:/Reports/report_${from}_${to}.xlsx`
  await wb.xlsx.writeFile(out)
  console.log(`\nSaved ${out}`)
} finally {
  await closePool()
}
