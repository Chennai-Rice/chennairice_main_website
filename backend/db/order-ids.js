// Prints the ID register and checks it. Read-only: safe on any database.
//
//   npm run db:order-ids                     last 30 Order IDs + check
//   npm run db:order-ids -- --all            every Order ID
//   npm run db:order-ids -- --csv out.csv    write the full list to a file
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closePool } from '../lib/db.js'
import { listIssuedIds, issuedIdsCsv, checkRegister } from '../lib/sales/idregister.js'

async function main() {
  const args = process.argv.slice(2)
  const csvAt = args.indexOf('--csv')
  if (csvAt > -1) {
    const file = args[csvAt + 1] || 'order-ids.csv'
    fs.writeFileSync(file, await issuedIdsCsv({ kind: 'order' }))
    console.log('Wrote ' + file)
  } else {
    const { total, ids } = await listIssuedIds(
      { kind: 'order', limit: args.includes('--all') ? 100000 : 30 },
      { maxLimit: 100000 }
    )
    console.log(`Order IDs issued: ${total}${ids.length < total ? ` (newest ${ids.length} shown)` : ''}\n`)
    console.table(ids.map((r) => ({
      'Order ID': r.id,
      Issued: new Date(r.issuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }),
      Customer: r.customer || '',
      Outcome: r.outcome,
      'Razorpay order': r.razorpayOrderId || '',
      'Shipment ID': r.shipmentId || '',
    })))
  }

  const check = await checkRegister()
  console.log(`\nRegister: ${check.totals.orders} order IDs, ${check.totals.shipments} shipment IDs, ${check.totals.orders_today} issued today.`)
  if (check.ok) console.log('Check passed: every ID is registered once and belongs to exactly one order.')
  else {
    console.log('CHECK FOUND PROBLEMS:')
    for (const p of check.problems) console.log(`  - ${p.check}: ${p.examples.join(', ')}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .catch((err) => {
      console.error(err.message)
      process.exitCode = 1
    })
    .finally(() => closePool())
}
