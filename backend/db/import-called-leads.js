// Puts the leads the team called from their own phones into NeoDove, with the remarks (Nov 2026 call sheets).
// Reads every .xlsx in D:\Diwali\neodove_import (columns Name, Mobile, Email, Lead type, Signed up, Remarks, Location,
// Pincode). By mobile: a lead NeoDove already has gets the remark added; any other is added, the telecallers taking turns.
//
//   node db/import-called-leads.js            says what it would do, sends nothing
//   node db/import-called-leads.js --apply    sends them
//
// Needs the database settings of db:migrate and NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA in the environment.
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { closePool, query } from '../lib/db.js'
import { importCalledLeads } from '../lib/neodove.js'

const dir = process.argv.find((a) => !a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isDirectory() && !a.endsWith('.js')) || 'D:/Diwali/neodove_import'
const apply = process.argv.includes('--apply')
const text = (v) => (v && typeof v === 'object' ? (v.text ?? v.result ?? (v.richText || []).map((t) => t.text).join('')) : v ?? '').toString().trim()

const rows = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('status_'))) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(dir, f))
  const s = wb.worksheets[0]
  const heads = Array.from(s.getRow(1).values || [], (h) => text(h).toLowerCase())
  const get = (r, name) => { const i = heads.indexOf(name); return i > 0 ? text(r.getCell(i).value) : '' }
  s.eachRow((r, i) => {
    if (i === 1 || !get(r, 'mobile')) return
    rows.push({ name: get(r, 'name'), mobile: get(r, 'mobile'), email: get(r, 'email'), leadType: get(r, 'lead type'),
      signedUp: get(r, 'signed up'), remarks: get(r, 'remarks'), location: get(r, 'location'), pincode: get(r, 'pincode') })
  })
  console.log(`${f}: read`)
}
try {
  const r = await importCalledLeads(rows, { query, apply })
  // One sheet per telecaller, grouped by call status: which leads to select in NeoDove for each bulk change
  // (NeoDove's Lead Status and Stage cannot be set from outside; its Bulk Actions can change them).
  const ORDER = ['Not connected', 'Call back', 'Interested', 'Not interested', 'Already bought', 'Ordered', 'Called']
  const TODO = {
    'Not connected': 'Bulk Update: stage Not connected / RNR', 'Call back': 'Bulk Update: stage Follow-up + date',
    Interested: 'Bulk Update: stage Interested', 'Not interested': 'Close Leads: Lost', 'Already bought': 'Close Leads: Lost',
    Ordered: 'Close Leads: Converted', Called: 'Bulk Update: stage Contacted',
  }
  const wb = new ExcelJS.Workbook()
  for (const agent of [...new Set(r.plan.map((p) => p.agent))].sort()) {
    const ws = wb.addWorksheet(agent)
    ws.columns = [{ header: 'Call status', key: 'status', width: 16 }, { header: 'Do in NeoDove', key: 'todo', width: 38 },
      { header: 'Mobile', key: 'mobile', width: 14 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Remarks', key: 'remarks', width: 70 }]
    ws.getRow(1).font = { bold: true }
    r.plan.filter((p) => p.agent === agent).sort((x, y) => ORDER.indexOf(x.status) - ORDER.indexOf(y.status))
      .forEach((p) => ws.addRow({ ...p, todo: TODO[p.status] }))
  }
  const file = path.join(dir, 'status_by_telecaller.xlsx')
  await wb.xlsx.writeFile(file)
  const { plan, ...summary } = r
  const counts = {}
  for (const p of plan) counts[`${p.agent} · ${p.status}`] = (counts[`${p.agent} · ${p.status}`] || 0) + 1
  console.log(JSON.stringify({ ...summary, byTelecallerAndStatus: counts }, null, 2))
  console.log('Saved', file)
  if (!apply) console.log('Nothing was sent. Run again with --apply to send them.')
} finally {
  await closePool()
}
