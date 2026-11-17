// Spin & Win codes won before the minimum orders were set (Nov 2026): gives every unused, unexpired spin code
// the minimum order its prize has on the wheel now (Warehouse → Settings → Spin & Win), matched by the prize's
// name. A minimum is only ever raised, never lowered. Codes already used, expired, or for a prize that is no
// longer on the wheel are left as they are.
//
//   node db/spin-apply-minimums.js          shows what would change, changes nothing
//   node db/spin-apply-minimums.js --apply  makes the change
//
// Prints counts only, never names or numbers. Run it with the same database settings as db:migrate.
import { query, closePool } from '../lib/db.js'

const apply = process.argv.includes('--apply')
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

try {
  const { rows: [s] } = await query(`select value from company_settings where key = 'spin_prizes'`)
  const prizes = JSON.parse(s?.value || '[]')
  if (!prizes.length) throw new Error('No Spin & Win prizes are saved in Settings: nothing to match against.')
  const byLabel = new Map(prizes.map((p) => [norm(p.label), Math.round(Number(p.minOrder || 0) * 100)]))

  const { rows } = await query(
    `select d.id, d.min_order_paise, sp.prize_label
       from discount_codes d join spins sp on sp.code_id = d.id
      where d.source = 'spin' and d.is_active
        and (d.expires_at is null or d.expires_at > now())
        and not exists (select 1 from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled'))`)

  const plan = new Map() // prize -> { from: Set, to, n }
  const change = []
  let notOnWheel = 0
  let alreadyOk = 0
  for (const r of rows) {
    const want = byLabel.get(norm(r.prize_label))
    if (want === undefined) { notOnWheel++; continue }
    if (Number(r.min_order_paise) >= want) { alreadyOk++; continue }
    change.push({ id: r.id, to: want })
    const p = plan.get(r.prize_label) || { from: new Set(), to: want, n: 0 }
    p.from.add(Number(r.min_order_paise) / 100)
    p.n++
    plan.set(r.prize_label, p)
  }

  console.log(`Unused, unexpired Spin & Win codes: ${rows.length}`)
  console.log(`  already at today's minimum: ${alreadyOk}`)
  console.log(`  prize no longer on the wheel (left as they are): ${notOnWheel}`)
  console.log(`  to raise to today's minimum: ${change.length}`)
  for (const [label, p] of plan) console.log(`    ${label}: ${p.n} code(s), minimum ₹${[...p.from].join(' / ₹')} → ₹${p.to / 100}`)

  if (!apply) {
    if (change.length) console.log('Nothing changed. Run again with --apply to make the change.')
  } else {
    for (const c of change) await query('update discount_codes set min_order_paise = $2 where id = $1 and min_order_paise < $2', [c.id, c.to])
    console.log(`Done: ${change.length} code(s) now need today's minimum order.`)
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
