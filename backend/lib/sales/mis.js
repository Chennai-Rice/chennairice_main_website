// The MIS dashboard's data (Nov 2026): the leads in the MIS Google Sheet, read by the server and handed to the
// dashboard (frontend/src/pages/mis). Read-only: the sheet stays the place where leads are edited.
//
//   GET /api/admin/mis/data    the sheet as clean rows, plus what was found in it (mis.view: owner, admin, IT, mis)
//
// How the sheet is read, in order of preference:
//   1. MIS_SHEET_CSV_URL   a "Publish to web" CSV link of the tab (simple, but anyone with the link can read it);
//   2. the Google Sheets API with the website's own service account (api-backend@…), which the sheet is shared
//      with as Viewer. Nobody else gets access.
// The columns are found by their names (Brand, Platform, Status, Telecaller …), not by their position, so a new
// column or a moved one does not break anything; what could not be matched is reported back and shown on screen.
// Google's answer is kept 3 minutes per server instance.
import { GoogleAuth } from 'google-auth-library'
import { parseCsv } from './advisor-files.js'
import { BRANDS, brandFromText, classifyCall, callOutcome } from './mis-rules.js'
import { httpError } from './util.js'

const SHEET_ID = () => process.env.MIS_SHEET_ID || '1J6J5zmeyEfM_RRHOy4HX6OKi8XFZ3fK4L1YtsyAKirM'
const SHEET_GID = () => String(process.env.MIS_SHEET_GID || '500982816') // the CALLS tab
const LEADS_GID = () => String(process.env.MIS_LEADS_GID || '0') // the LEADS tab
const SERVICE_ACCOUNT = 'api-backend@chennai-rice-website.iam.gserviceaccount.com'
const CACHE_MS = 3 * 60_000
const MIN_REFRESH_MS = 20_000

// ------------------------------------------------------------------ columns

/** A header made comparable: "Lead Status " and "lead_status" are the same column. */
const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// What each field is called in a sheet, best match first. A header matches when it equals a name, or contains it
// (longer names are tried first, so "leadstatus" wins over "status" in the same sheet).
const FIELDS = {
  date: ['leaddate', 'dateofenquiry', 'enquirydate', 'createddate', 'createdon', 'createdat', 'timestamp', 'date', 'month'],
  brand: ['brandname', 'brand'],
  platform: ['leadsource', 'platform', 'source', 'channel', 'medium'],
  stage: ['leadstage', 'leadtype', 'enquirytype', 'stage', 'type', 'category'],
  status: ['leadstatus', 'closurestatus', 'callstatus', 'status', 'outcome', 'result', 'disposition'],
  telecaller: ['callhandedby', 'callhandledby', 'telecaller', 'tele caller', 'assignedto', 'handledby', 'handedby', 'calledby', 'executive', 'agent', 'caller', 'owner'],
  device: ['device', 'dialer'],
  name: ['customername', 'leadname', 'clientname', 'name', 'customer'],
  phone: ['mobilenumber', 'phonenumber', 'mobileno', 'phoneno', 'mobile', 'phone', 'contact', 'whatsapp'],
  city: ['city', 'location', 'district', 'place', 'town'],
  product: ['productinterested', 'product', 'item'],
  manager: ['remarksbyleadmanager', 'leadmanagerremarks', 'managerremarks', 'remarksbymanager'],
  remark: ['requirements', 'requirement', 'remarks', 'remark', 'comments', 'comment', 'notes', 'note', 'feedback'],
}

/** Finds each field's column in the header row. Returns { field: columnIndex } for the ones found. */
export function mapColumns(headers) {
  const keys = headers.map(norm)
  const taken = new Set()
  const found = {}
  for (const [field, names] of Object.entries(FIELDS)) {
    const wanted = names.map(norm)
    let hit = -1
    for (const name of wanted) {
      hit = keys.findIndex((k, i) => k && !taken.has(i) && k === name)
      if (hit >= 0) break
    }
    if (hit < 0) {
      for (const name of wanted) {
        hit = keys.findIndex((k, i) => k && !taken.has(i) && k.includes(name))
        if (hit >= 0) break
      }
    }
    if (hit >= 0) {
      found[field] = hit
      taken.add(hit)
    }
  }
  return found
}

// ------------------------------------------------------------------- values

export const STATUSES = ['Positively closed', 'Negatively closed', 'In Process', 'Open / Pending', 'Complaint']

/** The five statuses the dashboard counts. `known` is false when the text fits none of them (counted as open). */
export function normStatus(value) {
  const v = String(value ?? '').toLowerCase().trim()
  if (!v) return { status: 'Open / Pending', known: true }
  if (/complaint/.test(v)) return { status: 'Complaint', known: true }
  if (/positive|won|convert|booked|success|order (placed|received|confirmed)|deal done|purchased/.test(v)) return { status: 'Positively closed', known: true }
  if (/negative|lost|not interested|reject|cancel|dropped|invalid|wrong number|dnd|no requirement|not required/.test(v)) return { status: 'Negatively closed', known: true }
  if (/process|progress|follow|call ?back|interested|quotation|negotiat|contacted|hot|warm|sample|price/.test(v)) return { status: 'In Process', known: true }
  if (/open|pending|new|not called|yet to|fresh|not contacted|not picked|no answer|ring/.test(v)) return { status: 'Open / Pending', known: true }
  return { status: 'Open / Pending', known: false }
}

export function normStage(value) {
  const v = String(value ?? '').trim()
  if (!v) return 'Not specified'
  if (/enquir/i.test(v)) return 'Enquiry'
  if (/complaint/i.test(v)) return 'Complaint'
  if (/^lead/i.test(v)) return 'Lead'
  return pretty(v.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()))
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const ymd = (y, m, d) => {
  if (y < 100) y += 2000
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : ''
}

/** A date as the sheet shows it to YYYY-MM-DD; '' when it cannot be read. Day first, as in India. */
export function parseDate(value) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t)
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t)
  if (m) return ymd(+m[3], +m[2], +m[1])
  m = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]+(\d{2,4})/.exec(t)
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  m = /^([A-Za-z]{3})[a-z]*[ -](\d{1,2}),?[ -](\d{4})/.exec(t)
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2])
  m = /^([A-Za-z]{3})[a-z]*[ -](\d{2,4})$/.exec(t) // "Oct 2026"
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(+m[2], MONTHS[m[1].toLowerCase()], 1)
  return ''
}

/** Names and brands: trimmed, single spaces, and "cri" / "CRI " counted as one. */
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const brandOf = (v) => {
  const t = clean(v)
  return t ? (t === t.toLowerCase() || t === t.toUpperCase() ? (t.length <= 4 ? t.toUpperCase() : t.replace(/\b\w/g, (c) => c.toUpperCase())) : t) : 'Not specified'
}

/** Capital letters made readable: "UNAVO EXPO" → "Unavo Expo"; short codes (CRI, CFF) and mixed case stay as typed. */
function pretty(v) {
  const letters = v.replace(/[^A-Za-z]/g, '')
  if (letters.length > 3 && letters === letters.toUpperCase()) return v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  if (letters && letters === letters.toLowerCase()) return v.replace(/\b[a-z]/g, (c) => c.toUpperCase())
  return v
}

/**
 * One spelling per value: "Whatsapp Bot", "WHATSAPP BOT" and "WHATSAPPBOT" are the same platform, so they are counted
 * together under the commonest spelling.
 */
function canonicalise(rows, field, skip = []) {
  const variants = new Map() // key → Map(spelling → count)
  for (const r of rows) {
    const v = r[field]
    const k = norm(v)
    if (!v || !k || skip.includes(v)) continue
    if (!variants.has(k)) variants.set(k, new Map())
    variants.get(k).set(v, (variants.get(k).get(v) || 0) + 1)
  }
  // The commonest spelling wins; on a tie the one with a space, then the one in mixed case ("Whatsapp Bot" over "WHATSAPPBOT").
  const nicer = (v) => (/\s/.test(v) ? 2 : 0) + (v !== v.toUpperCase() && v !== v.toLowerCase() ? 1 : 0)
  const chosen = new Map([...variants].map(([k, m]) => [k, pretty([...m].sort((a, b) => b[1] - a[1] || nicer(b[0]) - nicer(a[0]))[0][0])]))
  for (const r of rows) if (chosen.has(norm(r[field]))) r[field] = chosen.get(norm(r[field]))
}

// ------------------------------------------------------------------ dataset

/** The sheet (rows of text) as the dashboard's data: clean rows plus what was found. */
export function buildDataset(matrix, { sheetTitle = '', kind = 'calls' } = {}) {
  const grid = (matrix || []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
  const headerAt = grid.slice(0, 10).findIndex((r) => r.filter((c) => c.trim()).length >= 3)
  if (headerAt < 0) throw httpError('No header', { status: 422, publicMessage: 'The sheet has no header row with column names. The first rows should name the columns, such as Brand, Platform and Status.' })

  const headers = grid[headerAt].map((h) => clean(h))
  const cols = mapColumns(headers)
  const cell = (row, field) => (cols[field] == null ? '' : clean(row[cols[field]]))

  // Status: a Status column when the sheet has one; otherwise it is read from the call's REQUIREMENTS text (mis-rules.js).
  // Brand: a Brand column when there is one; otherwise from the brand the text names (CRI, CFF, Cholan).
  const statusFrom = cols.status != null || cols.manager != null ? 'column' : 'requirements'
  const brandFrom = cols.brand != null ? 'column' : 'text'
  const unmappedStatuses = new Map()
  const rules = new Map() // rule label → { status, count, examples }
  const unmatched = new Map() // remark text no rule matched → count
  const noName = /^(n\/?a|na|nil|-|none)$/i
  const rows = []
  for (const row of grid.slice(headerAt + 1)) {
    if (!row.some((c) => c.trim())) continue
    const stage = normStage(cell(row, 'stage'))
    const remark = cell(row, 'remark')
    let status
    if (statusFrom === 'column') {
      // the lead manager's remark ("Positively closed", "Process") says how the lead ended; the STATUS drop-down is the fallback
      const said = cell(row, 'manager') || cell(row, 'status')
      status = normStatus(said)
      if (!status.known) unmappedStatuses.set(said, (unmappedStatuses.get(said) || 0) + 1)
    } else {
      const call = classifyCall(remark, stage)
      status = { status: call.status }
      if (call.rule) {
        const r = rules.get(call.rule) || { status: call.status, count: 0, examples: new Set() }
        r.count += 1
        if (r.examples.size < 4 && remark) r.examples.add(remark.slice(0, 60))
        rules.set(call.rule, r)
      } else {
        unmatched.set(remark, (unmatched.get(remark) || 0) + 1)
      }
    }
    const date = parseDate(cell(row, 'date'))
    const name = cell(row, 'name')
    rows.push({
      n: rows.length + 1,
      date,
      month: date ? date.slice(0, 7) : '',
      brand: brandFrom === 'column' ? brandOf(cell(row, 'brand')) : brandFromText(`${remark} ${name}`) || 'Not specified',
      platform: cell(row, 'platform') ? clean(cell(row, 'platform')) : 'Not specified',
      stage,
      status: status.status,
      outcome: kind === 'calls' ? callOutcome(remark) : '',
      statusText: statusFrom === 'column' ? cell(row, 'manager') || cell(row, 'status') : '',
      telecaller: cell(row, 'telecaller') || 'Not assigned',
      device: cell(row, 'device'),
      name: noName.test(name) ? '' : name,
      phone: cell(row, 'phone'),
      city: cell(row, 'city'),
      product: cell(row, 'product'),
      remark,
    })
  }

  const same = [['platform', ['Not specified']], ['telecaller', ['Not assigned']], ['device', []], ['city', []]]
  if (brandFrom === 'column') same.push(['brand', ['Not specified']])
  for (const [field, skip] of same) canonicalise(rows, field, skip)

  const mapping = Object.fromEntries(Object.entries(cols).map(([field, i]) => [field, headers[i]]))
  return {
    kind, // 'calls' or 'leads'
    sheetTitle,
    headers: headers.filter(Boolean),
    mapping, // field → the sheet's column name that was used for it
    missing: Object.keys(FIELDS).filter((f) => cols[f] == null),
    statusFrom, // 'column' or 'requirements' (worked out from the call's text)
    brandFrom, // 'column' or 'text'
    brands: BRANDS, // always listed, even before a call names them
    statusRules: [...rules].map(([label, r]) => ({ label, status: r.status, count: r.count, examples: [...r.examples] })).sort((a, b) => b.count - a.count),
    unmatchedTexts: [...unmatched].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    unmappedStatuses: [...unmappedStatuses].map(([value, count]) => ({ value, count })),
    datesRead: rows.filter((r) => r.date).length,
    rows,
  }
}

// ------------------------------------------------------------------- source

let source = null // tests: async () => ({ title, values })
let cache = null
export function setMisSourceForTests(fn) {
  source = fn || null
  cache = null
}

/** A small sample shaped like the reference dashboard (102 leads), for trying the screens without the real sheet. */
function sampleSheet() {
  const brands = ['CRI', 'CFF']
  const platforms = ['Meta', 'Google', 'WhatsApp', 'Website', 'Expo']
  const callers = ['Priya', 'Divya', 'Karthik']
  const statuses = [...Array(12).fill('Positively closed'), ...Array(36).fill('Negatively closed'), ...Array(14).fill('In process'), ...Array(32).fill('Open'), ...Array(8).fill('Complaint')]
  const stages = [...Array(49).fill(''), ...Array(38).fill('Enquiry'), ...Array(10).fill('Lead'), ...Array(5).fill('Complaint')]
  const values = [['Date', 'Brand', 'Platform', 'Customer Name', 'Mobile', 'City', 'Stage', 'Status', 'Telecaller', 'Remarks']]
  for (let i = 0; i < 102; i++) {
    values.push([
      `${String(1 + (i % 28)).padStart(2, '0')}/${i % 3 === 0 ? '09' : '10'}/2026`, brands[i % 10 < 4 ? 0 : 1], platforms[(i * 7) % 5], `Sample Customer ${i + 1}`,
      `90000${String(10000 + i * 37).slice(-5)}`, ['Chennai', 'Erode', 'Salem', 'Coimbatore'][i % 4], stages[(i * 13) % 102], statuses[(i * 25) % 102], callers[i % 3], i % 5 === 0 ? 'Asked for a call back' : '',
    ])
  }
  return { title: 'Sample data', values }
}

async function sheetsToken() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const client = await auth.getClient()
  const t = await client.getAccessToken()
  return t.token || t
}

async function google(url, token) {
  let res
  try {
    res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) })
  } catch (err) {
    throw httpError('Sheets unreachable: ' + err.message, { status: 502, publicMessage: 'Could not reach Google Sheets. Try again in a minute.' })
  }
  if (res.ok) return res.json()
  const body = await res.json().catch(() => ({}))
  const why = body?.error?.message || res.status
  if (res.status === 403 && /scope/i.test(String(why))) {
    throw httpError('Sheets scope: ' + why, { status: 502, publicMessage: 'The server is not allowed to ask Google for spreadsheet access yet. Set MIS_SHEET_CSV_URL (a "Publish to web" CSV link of the tab) as a simple alternative, or tell the developer.' })
  }
  if (res.status === 403 || res.status === 404) {
    throw httpError('Sheets denied: ' + why, { status: 502, publicMessage: `The MIS sheet is not shared with the website. Share it as Viewer with ${SERVICE_ACCOUNT} and switch on the Google Sheets API for the project chennai-rice-website.` })
  }
  throw httpError('Sheets error: ' + why, { status: 502, publicMessage: 'Google Sheets answered with an error. Try again in a minute.' })
}

async function readSheet() {
  if (source) return source()
  if (process.env.MIS_SAMPLE === '1') return sampleSheet()

  if (process.env.MIS_SHEET_CSV_URL) {
    let res
    try {
      res = await fetch(process.env.MIS_SHEET_CSV_URL, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    } catch (err) {
      throw httpError('CSV unreachable: ' + err.message, { status: 502, publicMessage: 'Could not reach the published sheet. Try again in a minute.' })
    }
    if (!res.ok) throw httpError('CSV ' + res.status, { status: 502, publicMessage: 'The published sheet link did not open. Check that the tab is still published to the web.' })
    return { title: 'Published sheet', values: parseCsv(await res.text()) }
  }

  const token = await sheetsToken()
  const meta = await google(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}?fields=sheets.properties(sheetId,title)`, token)
  const tabs = (meta.sheets || []).map((x) => x.properties)
  const read = async (tab) => {
    const data = await google(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}/values/${encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      token)
    return { title: tab.title, values: data.values || [] }
  }
  const calls = tabs.find((p) => String(p.sheetId) === SHEET_GID()) || tabs[0]
  if (!calls) throw httpError('No tab', { status: 502, publicMessage: 'The MIS sheet has no tabs to read.' })
  const out = await read(calls)
  // The LEADS tab is optional: if it cannot be read the calls are still shown.
  const leadsTab = tabs.find((p) => String(p.sheetId) === LEADS_GID()) || tabs.find((p) => /^leads$/i.test(p.title))
  if (leadsTab && leadsTab.sheetId !== calls.sheetId) {
    try {
      out.leads = await read(leadsTab)
    } catch (err) {
      out.leadsError = err.publicMessage || err.message
    }
  }
  return out
}

/** The dashboard's data. `refresh` asks for a fresh read (at most once every 20 seconds per server instance). */
export async function misData({ refresh = false } = {}) {
  const age = cache ? Date.now() - cache.at : Infinity
  if (cache && (age < CACHE_MS ? !refresh || age < MIN_REFRESH_MS : false)) return cache.value
  const { title, values, leads, leadsError } = await readSheet()
  const value = { fetchedAt: new Date().toISOString(), ...buildDataset(values, { sheetTitle: title }), leads: null, leadsError: leadsError || '' }
  if (leads) {
    try {
      value.leads = buildDataset(leads.values, { sheetTitle: leads.title, kind: 'leads' })
    } catch (err) {
      value.leadsError = err.publicMessage || err.message
    }
  }
  cache = { at: Date.now(), value }
  return value
}

