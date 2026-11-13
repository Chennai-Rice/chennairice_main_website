// Puts the leads the team called from their own phones into NeoDove, with the remarks (Nov 2026 call sheets).
// Reads every .xlsx in D:\Diwali\neodove_import (columns Name, Mobile, Email, Lead type, Signed up, Remarks, Location,
// Pincode). By mobile: a lead NeoDove already has gets the remark added; any other is added, the telecallers taking turns.
//
//   node db/import-called-leads.js            says what it would do, sends nothing
//   node db/import-called-leads.js --apply    sends them
//   node db/import-called-leads.js --save-here   only saves each call's remark and result in our database, so the
//                                                 Analyst's New leads table shows them (nothing goes to NeoDove)
//
// Needs the database settings of db:migrate and NEODOVE_ENDPOINT_GAYATHRI / _RAMYA / _LAVANYA in the environment.
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { closePool, query } from '../lib/db.js'
import { importCalledLeads, callStatus } from '../lib/neodove.js'
import { crmMobile, isBlockedMobile } from '../lib/crm.js'

const dir = process.argv.find((a) => !a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isDirectory() && !a.endsWith('.js')) || 'D:/Diwali/neodove_import'
const saveHere = process.argv.includes('--save-here')
const apply = process.argv.includes('--apply') && !saveHere
const text = (v) => (v && typeof v === 'object' ? (v.text ?? v.result ?? (v.richText || []).map((t) => t.text).join('')) : v ?? '').toString().trim()

// Who made each sheet's calls, from their own phones on 7 Nov 2026 (owner, 12 Nov 2026).
const CALLER_BY_FILE = {
  'dump1_for_neodove.xlsx': 'Gayathri D', 'dump2_for_neodove.xlsx': 'Lavanya S', 'ramya_for_neodove.xlsx': 'Ramya S',
}
const CALLED_ON = '2026-11-07T12:00:00+05:30' // the day of the calls (the sheets give no time)

const rows = []
// Only the call sheets themselves (…_for_neodove.xlsx); not the lists this script and others made from them.
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('_for_neodove.xlsx'))) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(dir, f))
  const s = wb.worksheets[0]
  const heads = Array.from(s.getRow(1).values || [], (h) => text(h).toLowerCase())
  const get = (r, name) => { const i = heads.indexOf(name); return i > 0 ? text(r.getCell(i).value) : '' }
  s.eachRow((r, i) => {
    if (i === 1 || !get(r, 'mobile')) return
    rows.push({ name: get(r, 'name'), mobile: get(r, 'mobile'), email: get(r, 'email'), leadType: get(r, 'lead type'),
      signedUp: get(r, 'signed up'), remarks: get(r, 'remarks'), location: get(r, 'location'), pincode: get(r, 'pincode'),
      caller: CALLER_BY_FILE[f] || '' })
  })
  console.log(`${f}: read`)
}
if (saveHere) {
  // Only our own records: no NeoDove link is needed. The call result and remark go on the lead's record
  // (lead_status), as a NeoDove call result would; the Analyst's New leads table shows them under Status and
  // Remarks. The caller is the one who made that sheet's calls (CALLER_BY_FILE), dated 7 Nov. A lead called again
  // later in NeoDove keeps that newer result (a later call is the latest word); it is counted, not overwritten.
  // A buyer stays converted.
  try {
    let saved = 0
    let newer = 0
    const skipped = []
    const seen = new Set()
    const byCaller = {}
    for (const r of rows) {
      const mobile = crmMobile(r.mobile)
      if (!/^[6-9]\d{9}$/.test(mobile) || isBlockedMobile(mobile) || seen.has(mobile)) { skipped.push(`${r.name} ${r.mobile}`); continue }
      seen.add(mobile)
      const caller = r.caller || 'Team'
      const { rowCount } = await query(
        `insert into lead_status (mobile, name, status, last_disposition, last_remark, last_agent, last_called_at, calls)
         values ($1, $2, 'not_converted', $3, $4, $5, $6, 1)
         on conflict (mobile) do update set last_disposition = excluded.last_disposition, last_remark = excluded.last_remark,
           last_agent = excluded.last_agent, last_called_at = excluded.last_called_at,
           calls = greatest(lead_status.calls, 1), updated_at = now()
         where lead_status.last_called_at is null or lead_status.last_called_at <= excluded.last_called_at
            or lead_status.last_agent like '%(own phone)'`,
        [mobile, r.name || null, callStatus(r.remarks), r.remarks || null, caller, CALLED_ON])
      if (rowCount) { saved++; byCaller[caller] = (byCaller[caller] || 0) + 1 } else newer++
    }
    console.log(`Saved the remark, result and caller of ${saved} calls in our database (Analyst → New leads → Remarks).`, byCaller)
    if (newer) console.log(`${newer} leads were called again later in NeoDove: their newer NeoDove result was kept.`)
    if (skipped.length) console.log('Skipped (not a valid mobile, company number or a repeat):', skipped)
  } finally {
    await closePool()
  }
  process.exit(0)
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
  if (!apply) console.log('Nothing was sent. Run again with --apply to send them, or --save-here to show the remarks in the Analyst.')
} finally {
  await closePool()
}
