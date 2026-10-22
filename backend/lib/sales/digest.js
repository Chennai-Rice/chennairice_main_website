// The team's alert emails as ONE summary a day, at 9 o'clock India time, instead of an
// email for every event: new paid orders (new or repeat customer, and where they came
// from), cancellations and orders waiting too long at a step.
//
// The 10-minute job (jobs.js) calls sendDailyDigest(); it sends once the clock passes 9:00
// IST and the day's summary has not gone out yet. It covers everything since the last one.
// Nothing new and nothing waiting means no email that day.
import { query as defaultQuery } from '../db.js'
import { queueEmail, staffRecipients } from './email.js'
import { SOURCES } from './attribution.js'
import { formatInr, istDateStamp } from './util.js'

export const DIGEST_HOUR_IST = 9
const LAST_KEY = 'staff_digest_last_at'
const DAY_KEY = 'staff_digest_day'

// Orders sitting too long at one step (same rules the per-order reminders used).
const SLA = [
  { status: ['placed'], since: 'placed_at', after: '4 hours', what: 'paid but not confirmed for 4 hours' },
  { status: ['confirmed', 'packed'], since: 'placed_at', after: '2 days', what: 'not shipped 2 days after payment' },
  { status: ['shipped'], since: 'shipped_at', after: '7 days', what: 'shipped 7 days ago and not marked delivered' },
]

const istHour = (d = new Date()) => new Date(d.getTime() + 330 * 60000).getUTCHours()

const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** The summary for the orders and stock between `from` and `to`, or null when there is nothing to report. */
export async function buildDigest(from, to, query = defaultQuery) {
  const { rows: sales } = await query(
    `select o.order_number, o.contact_name, o.contact_phone, o.total_paise, o.placed_at,
            o.traffic_source, o.traffic_campaign, o.traffic_ad,
            (select count(*)::int from orders p
              where p.customer_id = o.customer_id and p.id <> o.id and p.payment_status in ('paid', 'partially_refunded', 'refunded')
                and p.placed_at < o.placed_at) as earlier
       from orders o
      where o.placed_at >= $1 and o.placed_at < $2 and o.payment_status in ('paid', 'partially_refunded', 'refunded')
      order by o.placed_at`,
    [from, to]
  )
  const { rows: cancelled } = await query(
    `select order_number, contact_name, contact_phone, total_paise, cancel_reason, payment_status, cancelled_at
       from orders
      where status = 'cancelled' and placed_at is not null and cancelled_at >= $1 and cancelled_at < $2
      order by cancelled_at`,
    [from, to]
  )
  const waiting = []
  for (const rule of SLA) {
    const { rows } = await query(
      `select order_number, contact_name, contact_phone, total_paise from orders
        where status = any($1) and ${rule.since} < now() - $2::interval order by ${rule.since} limit 50`,
      [rule.status, rule.after]
    )
    for (const r of rows) waiting.push({ ...r, what: rule.what })
  }
  // Low stock is not in the summary (owner, 22 Oct 2026): the warehouse panel shows it.
  if (!sales.length && !cancelled.length && !waiting.length) return null

  // One plain table per section, used for the email (HTML and text) and the Excel file.
  const rupees = (p) => Number(p) / 100
  const data = {
    from: from.toISOString(),
    to: to.toISOString(),
    sales: sales.map((r) => ({
      order: r.order_number, customer: r.contact_name, phone: r.contact_phone, amount: rupees(r.total_paise),
      customerType: r.earlier === 0 ? 'New' : 'Repeat',
      source: [SOURCES[r.traffic_source || 'direct'] || r.traffic_source, r.traffic_campaign && 'campaign ' + r.traffic_campaign, r.traffic_ad && 'ad ' + r.traffic_ad].filter(Boolean).join(' · '),
      placedAt: new Date(r.placed_at).toISOString(),
    })),
    cancelled: cancelled.map((r) => ({
      order: r.order_number, customer: r.contact_name, phone: r.contact_phone, amount: rupees(r.total_paise),
      reason: r.cancel_reason || '', refund: ['paid', 'partially_refunded'].includes(r.payment_status) ? 'PAID: check the refund' : '',
    })),
    waiting: waiting.map((r) => ({ order: r.order_number, customer: r.contact_name, phone: r.contact_phone, amount: rupees(r.total_paise), issue: r.what })),
  }

  const total = sales.reduce((n, r) => n + Number(r.total_paise), 0)
  const fresh = sales.filter((r) => r.earlier === 0).length
  const lines = []
  lines.push(`Summary since ${when(from)}.`, '')
  lines.push(`NEW PAID ORDERS: ${sales.length}${sales.length ? ` (${formatInr(total)}; ${fresh} new customer${fresh === 1 ? '' : 's'})` : ''}`)
  for (const r of data.sales) lines.push(`- ${r.order}  ${r.customer} (${r.phone})  ₹${r.amount.toFixed(2)}  ${r.customerType === 'New' ? 'NEW customer' : 'repeat customer'}  | from: ${r.source}`)
  lines.push('', `CANCELLED ORDERS: ${cancelled.length}`)
  for (const r of data.cancelled) lines.push(`- ${r.order}  ${r.customer} (${r.phone})  ₹${r.amount.toFixed(2)}${r.reason ? '  reason: ' + r.reason : ''}${r.refund ? '  | ' + r.refund : ''}`)
  lines.push('', `ORDERS WAITING TOO LONG: ${waiting.length}`)
  for (const r of data.waiting) lines.push(`- ${r.order}  ${r.customer} (${r.phone})  ₹${r.amount.toFixed(2)}  ${r.issue}`)
  lines.push('', 'The same lists are in the attached Excel file.', `Open the warehouse panel: ${PANEL}`)

  const bits = [sales.length && `${sales.length} new order${sales.length === 1 ? '' : 's'}`, cancelled.length && `${cancelled.length} cancelled`, waiting.length && `${waiting.length} waiting`].filter(Boolean)
  return {
    subject: `Daily summary: ${bits.join(', ')}`,
    text: lines.join('\n'),
    html: digestHtml(data, { total, fresh }),
    attachments: [{ kind: 'digest', data }],
  }
}

const PANEL = 'https://chennairiceindustries.com/warehouse'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The summary as an email page: count boxes, then one table per section (inline styles for mail apps). */
export function digestHtml(d, { total, fresh }) {
  const MAROON = '#7a1f2b'
  const cell = 'padding:8px 10px;border-bottom:1px solid #eee3d6;font-size:13px;color:#3a2a22;vertical-align:top'
  const head = `padding:8px 10px;background:${MAROON};color:#fff;font-size:12px;font-weight:600;text-align:left;white-space:nowrap`
  const table = (title, count, note, cols, rows, empty) => `
    <h2 style="margin:26px 0 8px;font-size:16px;color:${MAROON};font-family:Arial,sans-serif">${esc(title)} <span style="color:#9a8a7a;font-weight:normal">(${count})</span></h2>
    ${note ? `<p style="margin:0 0 8px;font-size:13px;color:#6b5b4b;font-family:Arial,sans-serif">${note}</p>` : ''}
    <table role="table" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;border:1px solid #eee3d6">
      <tr>${cols.map((c) => `<th style="${head}${c.right ? ';text-align:right' : ''}">${esc(c.label)}</th>`).join('')}</tr>
      ${rows.length
        ? rows.map((r, i) => `<tr style="background:${i % 2 ? '#fbf7f1' : '#ffffff'}">${cols.map((c) => `<td style="${cell}${c.right ? ';text-align:right;white-space:nowrap' : ''}${c.strong ? ';font-weight:600' : ''}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" style="${cell};color:#9a8a7a;text-align:center">${esc(empty)}</td></tr>`}
    </table>`
  const box = (label, n, alert) => `<td style="width:33%;padding:6px"><div style="border:1px solid #eee3d6;border-radius:8px;padding:12px;text-align:center;background:${alert && n ? '#fdecec' : '#fbf7f1'}">
      <div style="font-size:24px;font-weight:700;color:${alert && n ? '#b42318' : MAROON};font-family:Arial,sans-serif">${n}</div>
      <div style="font-size:12px;color:#6b5b4b;font-family:Arial,sans-serif">${esc(label)}</div></div></td>`
  const order = { label: 'Order', value: (r) => r.order, strong: true }
  const customer = { label: 'Customer', value: (r) => r.customer }
  const phone = { label: 'Phone', html: (r) => `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ''))}" style="color:${MAROON};text-decoration:none">${esc(r.phone)}</a>` }
  const amount = { label: 'Amount', value: (r) => inr(r.amount), right: true }
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6efdc">
  <div style="max-width:760px;margin:0 auto;padding:20px 14px;font-family:Arial,sans-serif">
    <div style="background:${MAROON};color:#fff;border-radius:10px 10px 0 0;padding:16px 20px">
      <div style="font-size:20px;font-weight:700">Chennai Rice · Daily summary</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">Since ${esc(when(d.from))}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 10px 10px;padding:14px 18px 22px">
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>
        ${box('New paid orders', d.sales.length)}${box('Cancelled', d.cancelled.length, true)}${box('Waiting too long', d.waiting.length, true)}
      </tr></table>
      ${table('New paid orders', d.sales.length, d.sales.length ? `Total ${inr(total / 100)} · ${fresh} new customer${fresh === 1 ? '' : 's'}` : '',
        [order, customer, phone, amount, { label: 'New / repeat', value: (r) => r.customerType }, { label: 'Came from', value: (r) => r.source }], d.sales, 'No new paid orders.')}
      ${table('Cancelled orders', d.cancelled.length, '',
        [order, customer, phone, amount, { label: 'Reason', value: (r) => r.reason || '—' }, { label: 'Refund', html: (r) => r.refund ? `<b style="color:#b42318">${esc(r.refund)}</b>` : '—' }], d.cancelled, 'No cancellations.')}
      ${table('Orders waiting too long', d.waiting.length, '',
        [order, customer, phone, amount, { label: 'Waiting for', html: (r) => `<span style="color:#b42318">${esc(r.issue)}</span>` }], d.waiting, 'Nothing waiting.')}
      <p style="margin:24px 0 6px;font-size:13px;color:#6b5b4b">The same lists are in the attached Excel file.</p>
      <a href="${PANEL}" style="display:inline-block;background:${MAROON};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:600">Open the warehouse panel</a>
    </div>
  </div></body></html>`
}

/** The summary as an Excel workbook (Buffer): a Summary sheet and one sheet per section. */
export async function digestWorkbook(d) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Chennai Rice'
  const style = (ws) => {
    const h = ws.getRow(1)
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1F2B' } }
    h.alignment = { vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  }
  const sheet = (name, columns, rows) => {
    const ws = wb.addWorksheet(name)
    ws.columns = columns
    for (const r of rows) ws.addRow(r)
    if (columns.some((c) => c.key === 'amount')) ws.getColumn('amount').numFmt = '"₹"#,##0.00'
    style(ws)
    return ws
  }
  const summary = wb.addWorksheet('Summary')
  summary.columns = [{ header: 'Section', key: 's', width: 28 }, { header: 'Count', key: 'n', width: 10 }]
  summary.addRows([
    { s: 'From', n: when(d.from) }, { s: 'To', n: when(d.to) },
    { s: 'New paid orders', n: d.sales.length }, { s: 'Cancelled orders', n: d.cancelled.length },
    { s: 'Orders waiting too long', n: d.waiting.length },
  ])
  style(summary)
  const base = [
    { header: 'Order', key: 'order', width: 22 }, { header: 'Customer', key: 'customer', width: 26 },
    { header: 'Phone', key: 'phone', width: 16 }, { header: 'Amount', key: 'amount', width: 12 },
  ]
  sheet('New paid orders', [...base, { header: 'Customer type', key: 'customerType', width: 14 }, { header: 'Came from', key: 'source', width: 40 },
    { header: 'Paid at', key: 'paidAt', width: 18 }], d.sales.map((r) => ({ ...r, paidAt: when(r.placedAt) })))
  sheet('Cancelled', [...base, { header: 'Reason', key: 'reason', width: 34 }, { header: 'Refund', key: 'refund', width: 24 }], d.cancelled)
  sheet('Waiting too long', [...base, { header: 'Waiting for', key: 'issue', width: 44 }], d.waiting)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/**
 * Called by the 10-minute job. Sends the day's summary once, after 9:00 IST. Returns what happened.
 * `now` is injectable for tests.
 */
export async function sendDailyDigest({ query = defaultQuery, now = new Date() } = {}) {
  if (istHour(now) < DIGEST_HOUR_IST) return { sent: false, reason: 'before the digest hour' }
  const day = istDateStamp(now)
  const { rows: [doneRow] } = await query(`select value from company_settings where key = $1`, [DAY_KEY])
  if (doneRow && doneRow.value === day) return { sent: false, reason: 'already done today' }

  const { rows: [last] } = await query(`select value from company_settings where key = $1`, [LAST_KEY])
  const from = last && !Number.isNaN(Date.parse(last.value)) ? new Date(last.value) : new Date(now.getTime() - 24 * 3600 * 1000)
  const digest = await buildDigest(from, now, query)
  // Even when nothing is reported, the day is done and the window moves on.
  for (const [key, value] of [[LAST_KEY, now.toISOString()], [DAY_KEY, day]]) {
    await query(
      `insert into company_settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, value]
    )
  }
  if (!digest) return { sent: false, reason: 'nothing to report' }
  const to = await staffRecipients({ query })
  if (!to) return { sent: false, reason: 'no recipients' }
  await queueEmail({ query }, { to, ...digest, template: 'staff_digest', dedupeKey: 'staff-digest:' + day })
  return { sent: true }
}
