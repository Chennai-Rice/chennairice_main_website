// Read-only: every lead the website has pushed to NeoDove (all time), with duplicates marked, as one Excel file in
// Downloads (owner, 28 Nov 2026). Sheets: Summary · Duplicates (who is in NeoDove more than once, which to keep and
// which to remove) · All pushed · Waiting & failed.
//   node db/neodove-duplicates-report.js      (database settings of db:migrate in the environment)
// Prints counts only. The file has customer names and numbers: internal use only, do not share outside the company.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { closePool, query } from '../lib/db.js'
import { neodoveReport } from '../lib/neodove-report.js'

try {
  const r = await neodoveReport({ query })
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const sheet = (name, title, rows) => {
    const ws = wb.addWorksheet(name)
    ws.addRow([title]).font = { bold: true, size: 13 }
    ws.addRow([])
    if (!rows.length) { ws.addRow(['None']); return }
    const cols = Object.keys(rows[0])
    const head = ws.addRow(cols)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6E1B22' } } })
    for (const row of rows) {
      const added = ws.addRow(cols.map((k) => row[k]))
      if (String(row.Duplicate || '').includes('remove')) added.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBEDEA' } } })
    }
    cols.forEach((k, i) => { ws.getColumn(i + 1).width = Math.min(60, Math.max(12, k.length + 2, ...rows.slice(0, 200).map((x) => String(x[k] ?? '').length + 2))) })
    ws.views = [{ state: 'frozen', ySplit: 3 }]
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } }
  }
  sheet('Summary', 'NeoDove – what the website pushed (all time)', r.summary)
  sheet('Duplicates', 'Customers in NeoDove more than once – keep the first, remove the others', r.duplicates)
  sheet('All pushed', 'Every lead pushed to NeoDove (rows marked "remove" are the extra copies)', r.all)
  sheet('Waiting & failed', 'Not in NeoDove (yet): waiting, failed, or added to the existing lead', r.notSent)
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const file = join(homedir(), 'Downloads', `NeoDove_Duplicates_${day}.xlsx`)
  await wb.xlsx.writeFile(file)
  console.log(`Pushed to NeoDove: ${r.counts.pushed} leads, ${r.counts.customers} different customers.`)
  console.log(`In NeoDove more than once: ${r.counts.duplicated} customers (${r.counts.extraCopies} extra copies to remove).`)
  console.log(`Waiting / failed / added to the existing lead: ${r.notSent.length}.`)
  console.log('Saved:', file)
} catch (err) {
  console.error('Could not build the report:', err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
