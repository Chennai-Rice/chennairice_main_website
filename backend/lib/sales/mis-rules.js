// How a call's outcome is read from the MIS sheet's REQUIREMENTS text (Nov 2026).
//
// The sheet is a calls log: it has no Status column, only what the telecaller wrote about the call ("RNR", "No Need",
// "Call Back", "Website Link", "Purchased" …) and the STAGE (Enquiry, Lead, Complaint, Random). Each call is put in one
// of the dashboard's five statuses by the FIRST rule below that matches, so the order matters. The dashboard shows
// every rule with how many calls it caught and a few examples, so the rules can be checked and changed here.
// If the sheet ever gets a real Status column, that column is used and these rules are not.

const has = (re) => (t) => re.test(t)

export const RULES = [
  { status: 'Complaint', label: 'Complaint (poor quality, stage Complaint)',
    test: (t, s) => s === 'complaint' || /poor quality|complaint|bad quality|damaged/.test(t) },

  { status: 'Negatively closed', label: 'Did not buy ("not purchased")', test: has(/not purchased|didn.?t purchase|did not purchase/) },

  { status: 'Positively closed', label: 'Bought (purchased, ordered)',
    test: has(/purchased|\bordered\b|order placed|payment done|alrdy purchased/) },

  { status: 'Negatively closed', label: 'No need, not interested, price too high',
    test: has(/no need|not interested|price is high|high rate|not required|no requirement/) },

  { status: 'Negatively closed', label: 'Wrong, unused or non-existing number',
    test: has(/wrong (number|no|enquiry)|incorrect no|not exist|does not exist|not in use|out of service|not in service|repeated number|invalid/) },

  { status: 'Negatively closed', label: 'Not a sales call (job, employee, supplier, bank…)',
    test: (t, s) => s === 'random' || /job vacancy|employee|supplier|credit card|axis bank|swipe machine|flipkart|onboarding|recuirement|recruitment|auction|lorry driver/.test(t) },

  { status: 'Open / Pending', label: 'Not reached (RNR, switched off, network error, call cut…)',
    test: has(/\brnr\b|not reachable|switched off|swiffed off|switch off|no incoming|incoming call not|network error|out of reach|call (cut|ended|disconnected|not connected|paused)|cal not connected|disconnected the call|missed call|unavailable/) },

  { status: 'In Process', label: 'Follow-up (call back, will call if needed, link or sample sent)',
    test: has(/call ?back|will call|he call|she will call|if (he|she|customer) need|will refer|resend|website link|website details|whatsapp the details|sample|price|rate list|details/) },

  { status: 'In Process', label: 'Has a question about the slogan bag or contest',
    test: (t) => /doubt/.test(t) && !/no (any )?doubt/.test(t) },

  { status: 'In Process', label: 'Enquiry (rice varieties, quantities, slogan bag)',
    test: (t, s) => s === 'enquiry' || /\benq|enquir|\d+ ?(kg|bags?|tons?)|\bbags?\b|\bkg\b|ponni|basmati|seeraga|idly|idli|boiled|kolam|pulungal|rice variet/.test(t) },

  { status: 'In Process', label: 'Query answered ("no doubt")', test: has(/no (any )?doubt/) },

  { status: 'In Process', label: 'Marked as a lead, or already contacted',
    test: (t, s) => s === 'lead' || /^lead$|contacted|already spe[ao]k/.test(t) },
]

// The brands the dashboard always lists. The sheet has no Brand column, so a call's brand is read from what the
// telecaller wrote; a call that names no brand stays "Not specified". Adding a BRAND column to the sheet is better:
// if one exists, it is used instead of these rules.
export const BRANDS = ['CRI', 'CFF', 'Cholan']

const BRAND_RULES = [
  ['Cholan', /cholan/],
  ['CFF', /\bcff\b/],
  ['CRI', /\bcri\b|chennai rice|kitchidi|slogan|pink bag|nayara|vintage|rajabhogam|alibaba|chennai gate|rudra/],
]

/** The brand named in a call's text, or '' when it names none. */
export function brandFromText(text) {
  const t = String(text ?? '').toLowerCase()
  const hit = BRAND_RULES.find(([, re]) => re.test(t))
  return hit ? hit[0] : ''
}

const NO_REMARK = 'No remark yet'

/** The status of one call and the rule that decided it ({ status, rule: null } when no rule matched). */
export function classifyCall(text, stage = '') {
  const t = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const s = String(stage ?? '').toLowerCase().trim()
  for (const rule of RULES) if (rule.test(t, s)) return { status: rule.status, rule: rule.label }
  return { status: 'Open / Pending', rule: t ? null : NO_REMARK }
}

const PAUSED = /call paused|\bpaused\b/
const INVALID = /wrong (number|no|enquiry)|incorrect no|not exist|does not exist|not in use|out of service|not in service|repeated number|invalid/
const NOT_REACHED = /\brnr\b|not reachable|switched off|swiffed off|switch off|no incoming|incoming call not|network error|out of reach|call (cut|ended|disconnected|not connected)|cal not connected|disconnected the call|missed call|unavailable/

/** How the call went, for the reports: 'paused', 'invalid' (wrong or dead number), 'rnr' (not reached) or 'connected'. */
export function callOutcome(text) {
  const t = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (PAUSED.test(t)) return 'paused'
  if (INVALID.test(t)) return 'invalid'
  if (NOT_REACHED.test(t)) return 'rnr'
  return 'connected'
}
