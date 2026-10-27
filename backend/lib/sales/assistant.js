// Staff assistant on /warehouse (Quick actions card): questions in plain
// English or Tamil, answered from live data. The AI (Groq) cannot run SQL; it
// can only call the read-only tools below, and each tool shapes its rows the
// same way the warehouse pages do — amounts only for roles with money.view.
import { query } from '../db.js'
import { httpError, str } from './util.js'
import { warehouseDashboard } from './deliveries.js'
import { listWarehouseOrders, TABS } from './warehouse.js'
import { listStock } from './inventory.js'
import { listIssues } from './issues.js'

const IST = `at time zone 'Asia/Kolkata'`
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ROUNDS = 5

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const range = (a = {}) => ({
  from: DATE.test(str(a.from)) ? str(a.from) : daysAgo(29),
  to: DATE.test(str(a.to)) ? str(a.to) : today(),
})

export const TOOLS = [
  {
    name: 'dashboard_summary',
    description: 'Right now: orders to dispatch, dispatched, delivered, open issues, today vs yesterday, this month by status, top products this month, low stock, the 6 latest orders, and the last 14 days per day (orders, dispatched, delivered, issues).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_orders',
    description: 'Find orders. q matches order number (CR-…), shipment ID (SHP-…), customer name, phone, city or PIN code. tab filters by stage. Dates are the day the order was placed (IST). Returns up to 25 orders with items, packs, kg, address, courier and tracking.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Text to search for; leave out to list all.' },
        tab: { type: 'string', enum: Object.keys(TABS), description: 'to_dispatch = paid and not shipped yet; dispatched = shipped, not delivered.' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        pack: { type: 'string', enum: ['5', '10', '26'], description: 'Only orders containing this pack size (kg).' },
        state: { type: 'string', enum: ['tn', 'other'], description: 'Tamil Nadu or outside it.' },
        newest_first: { type: 'boolean' },
      },
    },
  },
  {
    name: 'stock_levels',
    description: 'Current stock at the dispatch warehouse for every pack: on hand, reserved for unpaid/unshipped orders, available, reorder level and whether it is low.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'sales_by_day',
    description: 'Per day between two dates (IST): orders placed, packs and kg (and revenue when allowed). Cancelled and unpaid orders are left out. Defaults to the last 30 days.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
  },
  {
    name: 'sales_by_product',
    description: 'Per product and pack size between two dates (IST): orders, packs, kg (and revenue when allowed). Defaults to the last 30 days.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
  },
  {
    name: 'returns_and_issues',
    description: 'Returns / complaints logged against orders, by status (open, under_review, resolved): type, description, order, customer.',
    parameters: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'under_review', 'resolved'] }, q: { type: 'string' } } },
  },
]

/** The tools, bound to what this staff member may see (also used by the Business Advisor, advisor.js). */
export function toolRunner({ money }) {
  const revenue = money ? `, round(sum(i.line_total_paise) / 100.0)::int as revenue` : ''
  return {
    async dashboard_summary() {
      return warehouseDashboard({ money })
    },
    async search_orders(a = {}) {
      const r = await listWarehouseOrders(
        { q: a.q, tab: a.tab || 'all', from: a.from, to: a.to, pack: a.pack, state: a.state, sort: a.newest_first === false ? 'oldest' : 'newest', limit: 25 },
        { money, maxLimit: 25 })
      return {
        countsByStage: r.counts,
        shown: r.orders.length,
        totalInStage: r.tabCount,
        orders: r.orders.map((o) => ({
          orderNumber: o.orderNumber, shipmentId: o.shipmentId, status: o.status, payment: o.paymentStatus,
          placedAt: o.placedAt, shippedAt: o.shippedAt, customer: o.customer,
          city: o.address.city, state: o.address.state, pincode: o.address.pincode,
          items: (o.items || []).map((i) => `${i.qty} × ${i.name} ${Number(i.packKg)} kg`),
          packs: o.packs, kg: o.totalKg, waiting: o.overdue,
          courier: o.shipment && { method: o.shipment.method, carrier: o.shipment.carrier, tracking: o.shipment.trackingNumber || o.shipment.lrNumber, expected: o.shipment.expectedDelivery },
          ...(money ? { total: o.total } : {}),
        })),
      }
    },
    async stock_levels() {
      const rows = await listStock()
      return rows.filter((r) => r.is_fulfilment && r.is_active && r.product_active).map((r) => ({
        product: r.product_name, packKg: Number(r.pack_kg), onHand: r.on_hand, reserved: r.reserved,
        available: r.available, damaged: r.damaged, reorderLevel: r.reorder_level, low: r.low, sellsOnline: r.priced,
      }))
    },
    async sales_by_day(a) {
      const { from, to } = range(a)
      const { rows } = await query(
        `select to_char((o.placed_at ${IST})::date, 'YYYY-MM-DD') as day, count(distinct o.id)::int as orders,
                sum(i.quantity)::int as packs, sum(i.quantity * i.pack_kg)::float as kg${revenue}
           from orders o join order_items i on i.order_id = o.id
          where o.status not in ('pending_payment', 'cancelled') and o.placed_at is not null
            and (o.placed_at ${IST})::date between $1::date and $2::date
          group by 1 order by 1`, [from, to])
      return { from, to, days: rows }
    },
    async sales_by_product(a) {
      const { from, to } = range(a)
      const { rows } = await query(
        `select i.product_name as product, i.pack_kg::float as "packKg", count(distinct o.id)::int as orders,
                sum(i.quantity)::int as packs, sum(i.quantity * i.pack_kg)::float as kg${revenue}
           from orders o join order_items i on i.order_id = o.id
          where o.status not in ('pending_payment', 'cancelled') and o.placed_at is not null
            and (o.placed_at ${IST})::date between $1::date and $2::date
          group by 1, 2 order by packs desc`, [from, to])
      return { from, to, products: rows }
    },
    async returns_and_issues(a = {}) {
      const r = await listIssues({ tab: a.status || 'open', q: a.q, limit: 25 })
      return { counts: r.counts, issues: r.issues }
    },
  }
}

function systemPrompt({ name, money }) {
  return `You are the Chennai Rice warehouse assistant on the staff panel (/warehouse) of Chennai Rice Industries, a rice mill at Nasiyanur, Erode, Tamil Nadu. You are talking to ${name || 'a staff member'}. Today is ${today()} (India time, IST).

Answer questions about orders, dispatch, deliveries, stock, sales and returns using ONLY the tools — they read the live database. Call a tool for every factual question, even simple ones; never guess or invent orders, numbers, names or dates. If the tools return nothing, say so plainly.

Order stages: placed (paid, new) → confirmed → packed → shipped (dispatched) → delivered; also cancelled and returned. "To dispatch" means placed, confirmed or packed.
${money ? 'This person may see prices, revenue and order amounts (₹).' : 'This person may NOT see prices, revenue or order amounts. The tools do not return them; if asked, say that amounts are only shown to the owner and admin.'}
You can only read data. You cannot change orders, stock or anything else — for changes, tell them which page to use (Orders, Dispatch, Deliveries, Tracker Upload, Returns, Inventory).

Style: short and clear, like a helpful colleague. Lead with the answer. Use short bullet lists or a small markdown table for several rows. Give order numbers exactly (CR-…). Dates as "26 Oct". Reply in the language the person writes in (English, Tamil or Tanglish).`
}

async function groq({ apiKey, model, messages, tools }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, messages, temperature: 0.2, max_tokens: 1400,
      ...(tools ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw httpError(`Groq ${res.status}: ${text.slice(0, 300)}`, { status: 502, publicMessage: 'The assistant could not answer just now. Please try again.' })
  }
  return (await res.json()).choices?.[0]?.message
}

/**
 * One turn: the conversation so far (user/assistant text only) in, the
 * answer out, with the tools it used. Called with the signed-in staff member.
 */
export async function askAssistant(staff, body = {}, { money = false } = {}) {
  const apiKey = process.env.STAFF_GROQ_API_KEY || process.env.GROQ_API_KEY
  if (!apiKey) throw httpError('No assistant key', { status: 503, publicMessage: 'The assistant is not set up yet.' })
  const model = process.env.STAFF_GROQ_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  if (!history.length || history.at(-1).role !== 'user') throw httpError('Ask a question.')

  const run = toolRunner({ money })
  const messages = [{ role: 'system', content: systemPrompt({ name: staff?.full_name, money }) }, ...history]
  const used = []
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await groq({ apiKey, model, messages, tools: TOOLS })
    if (!msg) break
    if (!msg.tool_calls?.length) return { reply: (msg.content || '').trim() || 'I could not find an answer to that.', used }
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
    for (const call of msg.tool_calls) {
      const fn = run[call.function?.name]
      let result
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        result = fn ? await fn(args) : { error: 'No such tool.' }
        if (fn) used.push(call.function.name)
      } catch (err) {
        result = { error: err.publicMessage || err.message }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 24000) })
    }
  }
  // Out of rounds: ask for an answer from what it has, without more tools.
  const last = await groq({ apiKey, model, messages: [...messages, { role: 'user', content: 'Answer now from the data above.' }] })
  return { reply: (last?.content || '').trim() || 'I could not find an answer to that.', used }
}
