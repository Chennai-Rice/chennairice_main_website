// The Accounts section of the staff panel: invoices (the GST register),
// payments and refunds for a period, with totals. Read-only — refunds are
// still issued from the order by owner / admin / IT team.
//
// Periods are calendar days in India time, from and to inclusive
// (YYYY-MM-DD); with none given, the current month so far.
import { httpError, str } from './util.js'

const PAYMENT_METHOD = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay Later' }
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** { from, to } as YYYY-MM-DD (India time). */
export function period(params) {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
  const from = str(params?.from) || today.slice(0, 8) + '01'
  const to = str(params?.to) || today
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw httpError('Bad period', { publicMessage: 'Choose a valid date range.' })
  return { from, to }
}

// "issued in the period" in India time.
const IN_PERIOD = (col) => `(${col} at time zone 'Asia/Kolkata')::date between $1::date and $2::date`

const rupees = (paise) => Math.round(Number(paise || 0)) / 100

export async function accountsSummary(db, params) {
  const { from, to } = period(params)
  const [inv, rates, pays, refunds, pending] = await Promise.all([
    db.query(
      `select count(*)::int as invoices, coalesce(sum(total_paise), 0)::bigint as total,
              coalesce(sum(taxable_paise), 0)::bigint as taxable, coalesce(sum(cgst_paise), 0)::bigint as cgst,
              coalesce(sum(sgst_paise), 0)::bigint as sgst, coalesce(sum(igst_paise), 0)::bigint as igst
         from invoices where ${IN_PERIOD('issued_at')}`,
      [from, to]
    ),
    // Goods by GST rate (5% packs, nil-rated 26 kg packs) on those invoices.
    db.query(
      `select i.tax_rate_bp, count(*)::int as lines, sum(i.quantity)::int as packs,
              coalesce(sum(i.taxable_paise), 0)::bigint as taxable,
              coalesce(sum(i.cgst_paise + i.sgst_paise + i.igst_paise), 0)::bigint as tax
         from order_items i join invoices v on v.order_id = i.order_id
        where ${IN_PERIOD('v.issued_at')}
        group by i.tax_rate_bp order by i.tax_rate_bp desc`,
      [from, to]
    ),
    db.query(
      `select coalesce(method, 'other') as method, count(*)::int as payments, coalesce(sum(amount_paise), 0)::bigint as amount
         from payments where status = 'paid' and ${IN_PERIOD('paid_at')}
        group by 1 order by 3 desc`,
      [from, to]
    ),
    db.query(
      `select count(*)::int as refunds, coalesce(sum(amount_paise), 0)::bigint as amount,
              count(*) filter (where status in ('pending', 'failed'))::int as open
         from refunds where ${IN_PERIOD('created_at')}`,
      [from, to]
    ),
    // Paid but no invoice number yet (it is issued when the order is confirmed).
    db.query(
      `select count(*)::int as n from orders o
        where o.payment_status in ('paid', 'partially_refunded') and o.status <> 'cancelled'
          and not exists (select 1 from invoices v where v.order_id = o.id)`
    ),
  ])
  const i = inv.rows[0]
  const received = pays.rows.reduce((t, p) => t + Number(p.amount), 0)
  return {
    from, to,
    invoices: i.invoices,
    invoiced: rupees(i.total),
    taxable: rupees(i.taxable),
    cgst: rupees(i.cgst), sgst: rupees(i.sgst), igst: rupees(i.igst),
    gst: rupees(Number(i.cgst) + Number(i.sgst) + Number(i.igst)),
    received: rupees(received),
    refunded: rupees(refunds.rows[0].amount),
    refunds: refunds.rows[0].refunds,
    openRefunds: refunds.rows[0].open,
    net: rupees(received - Number(refunds.rows[0].amount)),
    paidWithoutInvoice: pending.rows[0].n,
    byRate: rates.rows.map((r) => ({ rate: r.tax_rate_bp / 100, packs: r.packs, taxable: rupees(r.taxable), tax: rupees(r.tax) })),
    byMethod: pays.rows.map((p) => ({ method: PAYMENT_METHOD[p.method] || p.method, payments: p.payments, amount: rupees(p.amount) })),
  }
}

/** The invoices issued in the period (the GST register), newest first. */
export async function invoiceRegister(db, params) {
  const { from, to } = period(params)
  const q = str(params?.q)
  const { rows } = await db.query(
    `select v.invoice_number, v.issued_at, v.place_of_supply, v.taxable_paise, v.cgst_paise, v.sgst_paise, v.igst_paise, v.total_paise,
            o.id as order_id, o.order_number, o.contact_name, o.contact_phone, o.status, o.payment_status, o.shipping_paise,
            p.method, p.gateway, p.gateway_payment_id, p.paid_at,
            (select coalesce(sum(r.amount_paise), 0) from refunds r where r.order_id = o.id and r.status in ('processed', 'manual'))::bigint as refunded_paise,
            (select string_agg(i.product_name || ' ' || trim(to_char(i.pack_kg, 'FM999')) || ' kg × ' || i.quantity, ', ')
               from order_items i where i.order_id = o.id) as items,
            exists (select 1 from order_items i where i.order_id = o.id and i.tax_rate_bp > 0) as taxed,
            exists (select 1 from order_items i where i.order_id = o.id and i.tax_rate_bp = 0) as exempt
       from invoices v
       join orders o on o.id = v.order_id
       left join payments p on p.order_id = o.id and p.status = 'paid'
      where ${IN_PERIOD('v.issued_at')}
        and ($3 = '' or v.invoice_number ilike '%' || $3 || '%' or o.order_number ilike '%' || $3 || '%'
             or o.contact_name ilike '%' || $3 || '%' or coalesce(p.gateway_payment_id, '') ilike '%' || $3 || '%')
      order by v.issued_at desc
      limit 2000`,
    [from, to, q]
  )
  return rows.map((r) => ({
    invoiceNumber: r.invoice_number,
    issuedAt: r.issued_at,
    type: r.taxed && r.exempt ? 'Invoice-cum-Bill of Supply' : r.taxed ? 'Tax Invoice' : 'Bill of Supply',
    orderId: r.order_id,
    orderNumber: r.order_number,
    customer: r.contact_name,
    phone: r.contact_phone,
    placeOfSupply: r.place_of_supply,
    items: r.items,
    taxable: rupees(r.taxable_paise),
    cgst: rupees(r.cgst_paise), sgst: rupees(r.sgst_paise), igst: rupees(r.igst_paise),
    total: rupees(r.total_paise),
    delivery: rupees(r.shipping_paise),
    refunded: rupees(r.refunded_paise),
    method: PAYMENT_METHOD[r.method] || r.method || '',
    paymentId: r.gateway_payment_id || '',
    paidAt: r.paid_at,
    orderStatus: r.status,
    paymentStatus: r.payment_status,
  }))
}

/** Every payment attempt in the period (paid, failed, waiting), newest first. */
export async function paymentsList(db, params) {
  const { from, to } = period(params)
  const status = ['paid', 'failed', 'created', 'superseded'].includes(params?.status) ? params.status : ''
  const { rows } = await db.query(
    `select p.gateway, p.gateway_order_ref, p.gateway_payment_id, p.amount_paise, p.status, p.method, p.card_last4,
            p.failure_reason, p.paid_at, p.created_at, o.id as order_id, o.order_number, o.contact_name,
            (select v.invoice_number from invoices v where v.order_id = o.id) as invoice_number
       from payments p join orders o on o.id = p.order_id
      where ${IN_PERIOD('coalesce(p.paid_at, p.created_at)')} and ($3 = '' or p.status = $3)
      order by coalesce(p.paid_at, p.created_at) desc
      limit 2000`,
    [from, to, status]
  )
  return rows.map((r) => ({
    at: r.paid_at || r.created_at,
    status: r.status,
    amount: rupees(r.amount_paise),
    method: PAYMENT_METHOD[r.method] || r.method || '',
    cardLast4: r.card_last4 || '',
    gateway: r.gateway === 'razorpay' ? 'Razorpay' : r.gateway,
    gatewayOrderId: r.gateway_order_ref,
    paymentId: r.gateway_payment_id || '',
    failure: r.failure_reason || '',
    orderId: r.order_id,
    orderNumber: r.order_number,
    customer: r.contact_name,
    invoiceNumber: r.invoice_number || '',
  }))
}

/** Refunds raised in the period, newest first. */
export async function refundsList(db, params) {
  const { from, to } = period(params)
  const { rows } = await db.query(
    `select r.amount_paise, r.reason, r.status, r.gateway_refund_id, r.created_at, r.processed_at,
            o.id as order_id, o.order_number, o.contact_name, p.gateway_payment_id, s.full_name as staff_name,
            (select v.invoice_number from invoices v where v.order_id = o.id) as invoice_number
       from refunds r join orders o on o.id = r.order_id join payments p on p.id = r.payment_id
       left join staff_users s on s.id = r.staff_id
      where ${IN_PERIOD('r.created_at')}
      order by r.created_at desc limit 1000`,
    [from, to]
  )
  return rows.map((r) => ({
    at: r.created_at,
    processedAt: r.processed_at,
    amount: rupees(r.amount_paise),
    reason: r.reason,
    status: r.status,
    refundId: r.gateway_refund_id || '',
    paymentId: r.gateway_payment_id || '',
    orderId: r.order_id,
    orderNumber: r.order_number,
    customer: r.contact_name,
    invoiceNumber: r.invoice_number || '',
    by: r.staff_name || '',
  }))
}

/** The invoice register as CSV, for the accountant's GST filing. */
export async function invoiceRegisterCsv(db, params) {
  const rows = await invoiceRegister(db, params)
  const cell = (v) => {
    let t = String(v ?? '')
    if (/^[=+\-@]/.test(t)) t = "'" + t // never a spreadsheet formula
    return '"' + t.replace(/"/g, '""') + '"'
  }
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }) : '')
  const head = ['Invoice No', 'Invoice Date', 'Type', 'Order No', 'Customer', 'Place of Supply', 'Items', 'Taxable Value', 'CGST', 'SGST', 'IGST',
    'Invoice Total', 'of which Delivery', 'Refunded', 'Payment Method', 'Razorpay Payment ID', 'Order Status']
  const lines = [head].concat(rows.map((r) => [r.invoiceNumber, day(r.issuedAt), r.type, r.orderNumber, r.customer, r.placeOfSupply, r.items,
    r.taxable.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2), r.total.toFixed(2), r.delivery.toFixed(2), r.refunded.toFixed(2),
    r.method, r.paymentId, r.orderStatus]))
  return '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n')
}
