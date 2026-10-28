// /admin → Reports: the website's own data as spreadsheets (CSV), one per kind, for the owner and the
// IT team (analyst.view). Each one reuses the query behind the page that already shows it, so the file
// and the screen agree. Personal details (names, phones, emails) are in them; the sign-in is the guard.
import { query } from '../db.js'
import { cell, listWarehouseOrders, listWarehouseCustomers } from './warehouse.js'
import { contestLeads } from './attribution.js'
import { listExpoLeads } from './expo.js'
import { listEnquiries } from './enquiries-admin.js'
import { listJourneys } from './journeys.js'
import { httpError, str } from './util.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const istDay = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
const when = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** Opens straight in Excel: a BOM so ₹ and Tamil survive, and a cell never runs as a formula. */
export function toCsv(header, lines) {
  return '﻿' + [header, ...lines].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** The period from ?days (7, 30, 90, 365) or ?from & ?to (India dates). `all` has no limit in time. */
function span(q) {
  const days = Math.min(366, Math.max(1, Number(q.days) || 30))
  const to = DAY.test(str(q.to)) ? str(q.to) : istDay()
  const from = DAY.test(str(q.from)) ? str(q.from) : new Date(Date.now() + 330 * 60000 - (days - 1) * 864e5).toISOString().slice(0, 10)
  const length = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1)
  return { from, to, days: Math.min(366, length) }
}
const inPeriod = (when, { from, to }) => {
  const d = new Date(new Date(when).getTime() + 330 * 60000).toISOString().slice(0, 10)
  return d >= from && d <= to
}

/** Every report: what it is, whether the period applies, and how to build its CSV. */
export const REPORTS = {
  orders: {
    label: 'Orders',
    note: 'Every paid or attempted order: products, packs, weight, amount, payment and delivery status, address.',
    period: true,
    async build(q) {
      const p = span(q)
      const { orders } = await listWarehouseOrders({ tab: 'all', from: p.from, to: p.to, limit: 5000, offset: 0 }, { maxLimit: 5000, money: true })
      return {
        header: ['Order ID', 'Order date', 'Customer', 'Phone', 'Products', 'Packs', 'Weight (kg)', 'Amount (₹)', 'Payment', 'Status', 'City', 'State', 'PIN'],
        lines: orders.map((o) => [
          o.orderNumber, when(o.placedAt), o.customer.name, o.customer.phone,
          o.items.map((i) => `${i.qty} x ${i.name} (${Number(i.packKg)} kg)`).join('; '),
          o.packs, o.totalKg, o.total, o.paymentStatus, o.status, o.address.city, o.address.state, o.address.pincode,
        ]),
      }
    },
  },
  customers: {
    label: 'Customers',
    note: 'Everyone who has ordered or signed up: source, converted or not, orders and packs, first and last order.',
    period: false,
    async build() {
      const { customers } = await listWarehouseCustomers({ limit: 20000, offset: 0 }, { maxLimit: 20000 })
      return {
        header: ['Customer', 'Phone', 'Email', 'Source', 'Status', 'City', 'State', 'Orders', 'Packs', 'First order', 'Last order'],
        lines: customers.map((c) => [c.name, c.phone, c.email, c.source, c.converted ? 'Converted' : 'Not converted', c.city, c.state,
          c.orders, c.packs, when(c.firstOrderAt), when(c.lastOrderAt)]),
      }
    },
  },
  signups: {
    label: 'Ad pop-up sign-ups',
    note: 'People who registered in the pop-up shown to ad visitors: where they came from, the campaign and ad, OTP verified.',
    period: true,
    async build(q) {
      const leads = await contestLeads({ query }, { days: span(q).days })
      return {
        header: ['Signed up', 'Name', 'Mobile', 'Mobile verified (OTP)', 'Email', 'Came from', 'Campaign', 'Ad', 'Page', 'Times signed up'],
        lines: leads.map((l) => [when(l.updated_at), l.name, l.phone, l.phone_verified ? 'Yes' : 'No', l.email, l.sourceLabel, l.campaign, l.ad, l.landing, l.submissions]),
      }
    },
  },
  expo: {
    label: 'Expo QR leads',
    note: 'Leads from the expo QR form: customer type, requirement, location.',
    period: true,
    async build(q) {
      const leads = await listExpoLeads({ query }, { days: span(q).days })
      return {
        header: ['Date', 'Name', 'Mobile', 'Email', 'Location', 'Customer type', 'Requirement', 'Expo', 'Times submitted'],
        lines: leads.map((l) => [when(l.at), l.name, l.phone, l.email, l.location, l.buyerType, l.requirement, l.campaign, l.submissions]),
      }
    },
  },
  enquiries: {
    label: 'Contact and bulk enquiries',
    note: 'What people sent from the Contact and Bulk order forms, with the status the team set.',
    period: true,
    async build(q) {
      const p = span(q)
      const { contact, bulk } = await listEnquiries()
      const keep = (rows) => rows.filter((r) => inPeriod(r.created_at, p))
      return {
        header: ['Received', 'Form', 'Name / company', 'Representative', 'Buyer type', 'Email', 'Phone', 'Quantity (kg)', 'GSTIN', 'Message', 'Status'],
        lines: [
          ...keep(contact).map((r) => [when(r.created_at), 'Contact', r.name, '', '', r.email, r.phone, '', '', r.enquiry, r.status]),
          ...keep(bulk).map((r) => [when(r.created_at), 'Bulk order', r.company_or_name, r.representative_name,
            r.buyer_type === 'other' ? r.other_type || 'Other' : r.buyer_type, r.email, r.phone, r.quantity_kg, r.gstin, r.message, r.status]),
        ],
      }
    },
  },
  checkout: {
    label: 'Checkout journeys',
    note: 'Each shopper’s path: cart → checkout → details → payment, and where they stopped or whether they bought.',
    period: true,
    async build(q) {
      const p = span(q)
      const journeys = []
      for (let offset = 0; offset < 5000; offset += 500) {
        const page = await listJourneys({ from: p.from, to: p.to, limit: 500, offset })
        journeys.push(...page.journeys)
        if (journeys.length >= page.total) break
      }
      return {
        header: ['Started', 'Last activity', 'Outcome', 'Last step', 'Customer', 'Phone', 'Email', 'Place', 'Basket', 'Value (₹)', 'Order', 'Payment attempts', 'Error', 'Source'],
        lines: journeys.map((j) => [
          when(j.startedAt), when(j.updatedAt), j.outcome, j.stage, j.customer?.name, j.customer?.phone, j.customer?.email, j.place,
          Array.isArray(j.items) ? j.items.map((i) => `${i.qty ?? i.quantity ?? 1} x ${i.name ?? i.slug ?? ''}`).join('; ') : '',
          j.value, j.orderNumber, j.paymentAttempts, j.lastError, j.source,
        ]),
      }
    },
  },
}

/** What the Reports screen lists. */
export function listReports() {
  return Object.entries(REPORTS).map(([id, r]) => ({ id, label: r.label, note: r.note, period: r.period }))
}

/** One report as a downloadable CSV: { filename, csv }. */
export async function reportCsv(id, q = {}) {
  const report = REPORTS[id]
  if (!report) throw httpError('Unknown report.', { status: 404, publicMessage: 'That report does not exist.' })
  const { header, lines } = await report.build(q)
  const p = report.period ? span(q) : null
  return {
    filename: `${id}${p ? `-${p.from}-to-${p.to}` : `-${istDay()}`}.csv`,
    csv: toCsv(header, lines),
    rows: lines.length,
  }
}
