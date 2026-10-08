// Sample paid orders and staff logins for trying the /warehouse page locally.
//
//   npm run db:demo-orders
//
// LOCAL DATABASES ONLY: refuses to run against Cloud SQL or a non-local
// DATABASE_URL. Orders go through the real order code (stock is held, IDs are
// issued) and are marked paid with a fake "demo" payment, so they behave
// exactly like real ones on the warehouse and tracking pages.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, closePool } from '../lib/db.js'
import { placeOrder, markOrderPaid } from '../lib/sales/checkout.js'
import { setDispatched } from '../lib/sales/operations.js'

export const LOCAL_STAFF = [
  { email: 'admin@chennairiceindustries.com', name: 'Owner (local)', role: 'owner' },
  { email: 'warehouse@chennairiceindustries.com', name: 'Warehouse (local)', role: 'warehouse' },
]

const CUSTOMERS = [
  ['Lakshmi Ramesh', '98431 22018', '14, Gandhi Road, RS Puram', 'Opp. Anna Park', 'Coimbatore', 'Tamil Nadu', '641002', [['alibaba-26kg', 1], ['vintage-5kg', 2]]],
  ['Karthik Subramanian', '94433 51277', '7/2 Perundurai Road', null, 'Erode', 'Tamil Nadu', '638011', [['special-rajabhogam-10kg', 3]]],
  ['Meena Sundaram', '99440 12345', '22, Five Roads', 'Near bus stand', 'Salem', 'Tamil Nadu', '636004', [['viruchagam-26kg', 1]]],
  ['Arun Prakash', '90031 88542', 'Flat 3B, Sri Nivas Apartments, T Nagar', null, 'Chennai', 'Tamil Nadu', '600017', [['nayara-super-aged-10kg', 2], ['a1-special-ponni-5kg', 1]]],
  ['Divya Krishnan', '97890 44120', '18 Bypass Road', 'Behind KMC Hospital', 'Madurai', 'Tamil Nadu', '625010', [['chennai-bullets-26kg', 2]]],
  ['Suresh Nair', '94470 63391', 'TC 12/440, Pattom', null, 'Thiruvananthapuram', 'Kerala', '695004', [['vijaya-nagaram-10kg', 1], ['united-5kg-5kg', 2]]],
  ['Priya Venkatesh', '98860 21734', '#45, 4th Cross, Jayanagar', null, 'Bengaluru', 'Karnataka', '560041', [['alibaba-10kg', 2]]],
  ['Mohammed Rafiq', '96009 11583', '3, Big Bazaar Street', 'Near Clock Tower', 'Tiruchirappalli', 'Tamil Nadu', '620008', [['vintage-26kg', 1]]],
]

// What the sample orders show on the warehouse page: most still to dispatch,
// two already dispatched.
const PLAN = [null, 'dispatched', null, null, null, 'dispatched', null, null]

function assertLocal() {
  const url = String(process.env.DATABASE_URL || '')
  if (process.env.CLOUD_SQL_INSTANCE || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error('demo-orders is for a local database only.')
  }
}

export async function createDemo({ log = console.log } = {}) {
  assertLocal()
  for (const s of LOCAL_STAFF) {
    await query(
      `insert into staff_users (email, full_name, role) values ($1, $2, $3)
       on conflict (email) do update set role = excluded.role, is_active = true`,
      [s.email, s.name, s.role]
    )
  }
  const { rows: [whStaff] } = await query(`select * from staff_users where email = $1`, [LOCAL_STAFF[1].email])

  for (const [i, c] of CUSTOMERS.entries()) {
    const [name, phone, line1, landmark, city, state, pincode, items] = c
    const order = await placeOrder(
      {
        name, phone: '+91 ' + phone, email: name.toLowerCase().replace(/\W+/g, '.') + '@example.com',
        addressLine1: line1, addressLine2: '', landmark: landmark || '', city, state, pincode,
      },
      items.map(([id, qty]) => ({ id, qty }))
    )
    const { rows: [pay] } = await query(
      `insert into payments (order_id, gateway, gateway_order_ref, amount_paise)
       values ($1, 'razorpay', $2, $3) returning id`,
      [order.id, 'demo_' + order.order_number, order.total_paise]
    )
    await markOrderPaid({
      paymentRowId: pay.id,
      actor: 'gateway',
      outcome: { transactionId: 'pay_demo_' + order.order_number, amountPaise: Number(order.total_paise), method: 'upi', raw: { demo: true } },
    })
    if (PLAN[i]) await setDispatched(whStaff, order.id, { on: true })
    log(`  ${order.order_number}  ${name.padEnd(20)} ${city.padEnd(18)} ${PLAN[i] || 'to dispatch'}`)
  }
  log('\n  Local sign-in on /warehouse:')
  for (const s of LOCAL_STAFF) log(`    ${s.email}  (${s.role})`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createDemo()
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Demo orders failed:', err.message)
      await closePool()
      process.exit(1)
    })
}
