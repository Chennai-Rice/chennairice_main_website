// Everything the website has pushed to NeoDove, with duplicates marked (owner, 28 Nov 2026): who is in NeoDove more
// than once (in two campaigns, or twice in one), which copy to keep (the first) and which to remove, plus what is still
// waiting or failed. Read-only. Used by db/neodove-duplicates-report.js, which writes the Excel file.
// Contains names and numbers: internal use only.
import { ROUTE_NAMES, leadType } from './neodove.js'

const OLD_AGENTS = { gayathri: 'Gayathri (old campaign)', ramya: 'Ramya (old campaign)', lavanya: 'Lavanya (old campaign)' }
const OLD_KINDS = { signup: 'Sign-up (old single campaign)', checkout_payment: 'Payment not completed (old)', checkout_details: 'Left at details (old)' }

/** The NeoDove campaign an outbox row went to. */
export function neodoveCampaign(r) {
  if (r.agent && ROUTE_NAMES[r.agent]) return ROUTE_NAMES[r.agent]
  if (r.agent && OLD_AGENTS[r.agent]) return OLD_AGENTS[r.agent]
  if (r.agent) return r.agent
  return OLD_KINDS[r.campaign] || leadType(r.campaign, r.source)
}
const mobileText = (m) => { const d = String(m || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(m || '') }
const ist = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const STATUS = { not_converted: 'Not called / no decision', qualified: 'Qualified', not_qualified: 'Not qualified', converted: 'Bought' }

/** { summary, all, duplicates, notSent } — rows ready for a spreadsheet. */
export async function neodoveReport(db) {
  const { rows } = await db.query(
    `select n.id, n.mobile, n.campaign, n.agent, n.status, n.last_error, n.created_at, n.sent_at,
            s.name, s.source, s.status as lead_status, s.last_disposition, s.last_agent, s.calls, s.last_called_at
       from neodove_outbox n left join lead_status s on s.mobile = n.mobile
      order by n.mobile, coalesce(n.sent_at, n.created_at)`)
  const pushedRow = (r) => r.status === 'sent' && !/^(not sent again|merged)/i.test(String(r.last_error || ''))

  const pushed = rows.filter(pushedRow)
  const byMobile = new Map()
  for (const r of pushed) { if (!byMobile.has(r.mobile)) byMobile.set(r.mobile, []); byMobile.get(r.mobile).push(r) }

  const all = []
  const duplicates = []
  for (const [mobile, list] of byMobile) {
    const dup = list.length > 1
    list.forEach((r, i) => all.push({
      Mobile: mobileText(mobile), Name: r.name || '', 'NeoDove campaign': neodoveCampaign(r), 'Lead type': leadType(r.campaign, r.source),
      'Pushed on': ist(r.sent_at || r.created_at), Duplicate: dup ? (i === 0 ? 'Yes – keep (first)' : `Yes – remove (copy ${i + 1} of ${list.length})`) : 'No',
      'Call result': r.last_disposition || '', 'Lead status': STATUS[r.lead_status] || '', 'Called by': r.last_agent || '', Calls: r.calls || 0,
    }))
    if (dup) {
      const keep = list[0]
      duplicates.push({
        Mobile: mobileText(mobile), Name: keep.name || '', 'Times in NeoDove': list.length,
        'In campaigns (first first)': list.map((r) => `${neodoveCampaign(r)} (${ist(r.sent_at || r.created_at)})`).join('  |  '),
        Keep: neodoveCampaign(keep), 'Remove from': list.slice(1).map(neodoveCampaign).join(', '),
        'What they did': [...new Set(list.map((r) => leadType(r.campaign, r.source)))].join(', '),
        'Call result': keep.last_disposition || '', 'Lead status': STATUS[keep.lead_status] || '', 'Called by': keep.last_agent || '',
      })
    }
  }
  duplicates.sort((a, b) => b['Times in NeoDove'] - a['Times in NeoDove'])

  const notSent = rows.filter((r) => !pushedRow(r)).map((r) => ({
    Mobile: mobileText(r.mobile), Name: r.name || '', 'Would go to': neodoveCampaign(r), 'Lead type': leadType(r.campaign, r.source),
    Status: r.status === 'sent' ? 'Not sent: added to the lead NeoDove already has' : r.status === 'queued' ? 'Waiting' : 'Failed',
    Reason: r.last_error || '', 'Queued on': ist(r.created_at),
  }))

  const perCampaign = {}
  for (const r of pushed) perCampaign[neodoveCampaign(r)] = (perCampaign[neodoveCampaign(r)] || 0) + 1
  const dupCopies = duplicates.reduce((a, d) => a + d['Times in NeoDove'] - 1, 0)
  const summary = [
    { Measure: 'Leads pushed to NeoDove (all time)', Count: pushed.length },
    { Measure: 'Different customers in NeoDove', Count: byMobile.size },
    { Measure: 'Customers in NeoDove more than once', Count: duplicates.length },
    { Measure: 'Extra copies to remove (keeping the first of each)', Count: dupCopies },
    { Measure: 'Not sent: added to the existing NeoDove lead instead', Count: rows.filter((r) => r.status === 'sent' && !pushedRow(r)).length },
    { Measure: 'Waiting to go to NeoDove', Count: rows.filter((r) => r.status === 'queued').length },
    { Measure: 'Failed', Count: rows.filter((r) => r.status === 'failed').length },
    ...Object.entries(perCampaign).sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ Measure: `Pushed to campaign: ${c}`, Count: n })),
  ]
  return { summary, all, duplicates, notSent, counts: { pushed: pushed.length, customers: byMobile.size, duplicated: duplicates.length, extraCopies: dupCopies } }
}
