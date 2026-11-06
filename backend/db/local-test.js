// LOCAL TESTING ONLY: finish a test order without a real payment, and clear test spins.
//
//   node db/local-test.js paid CR-20261106-ABCDE     mark that order paid (as if Razorpay said so)
//   node db/local-test.js reset-spin 9876543210      forget that mobile's spin, so it can spin again
//
// Refuses to run unless DATABASE_URL points at this computer (never the live database).
import { query, closePool } from '../lib/db.js'
import { markOrderPaid } from '../lib/sales/checkout.js'

const url = String(process.env.DATABASE_URL || '')
if (process.env.CLOUD_SQL_INSTANCE || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error('local-test.js only runs on the local database (DATABASE_URL=postgres://...@localhost:5433/...).')
  process.exit(1)
}
const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'paid') {
    const { rows: [o] } = await query('select * from orders where order_number = $1', [String(arg || '').trim()])
    if (!o) throw new Error('No order ' + arg)
    if (o.payment_status === 'paid') throw new Error(o.order_number + ' is already paid')
    let { rows: [p] } = await query(
      `select id from payments where order_id = $1 and status in ('created', 'superseded') order by created_at desc limit 1`, [o.id])
    if (!p) {
      ({ rows: [p] } = await query(
        `insert into payments (order_id, gateway, gateway_order_ref, amount_paise) values ($1, 'razorpay', $2, $3) returning id`,
        [o.id, 'local_' + o.order_number, o.total_paise]))
    }
    const r = await markOrderPaid({
      paymentRowId: p.id, actor: 'customer',
      outcome: { paid: true, transactionId: 'pay_local_' + Date.now(), amountPaise: Number(o.total_paise), currency: 'INR', method: 'upi' },
    })
    console.log(`Paid: ${r.order.order_number}, ₹${Number(r.order.total_paise) / 100}` +
      (Number(r.order.discount_paise) ? `, discount ₹${Number(r.order.discount_paise) / 100} (${r.order.discount_code})` : '') +
      (r.referralCode ? `. Customer's referral code: ${r.referralCode}` : ''))
  } else if (cmd === 'reset-spin') {
    const phone = String(arg || '').replace(/\D/g, '').slice(-10)
    const { rows } = await query('delete from spins where phone = $1 returning code_id, device_id', [phone])
    for (const r of rows) {
      await query(`update discount_codes set is_active = false where id = $1`, [r.code_id])
      if (r.device_id) await query('update spins set device_id = null where device_id = $1', [r.device_id])
    }
    console.log(rows.length ? `Spin for ${phone} cleared. Open the site in a new Incognito window to spin again.` : `No spin for ${phone}.`)
  } else {
    console.log('Use: paid CR-...  |  reset-spin MOBILE')
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await closePool()
}
