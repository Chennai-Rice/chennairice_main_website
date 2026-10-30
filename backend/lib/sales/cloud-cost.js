// /admin → Cloud Centre (Oct 2026), Phase 3: what the Google Cloud and Firebase
// projects cost, and a security check of who has access and what is public.
//
// Cost   Google's billing export in BigQuery: one dataset per billing account
//        (set up in Phase 0). The tables appear about a day after the export is
//        switched on; until then the page says it is waiting. Each read is one
//        small query (capped at 1 GB scanned), cached for an hour.
// Budgets  the Cloud Billing budgets on each billing account, against this month's spend.
// Security  Cloud Asset Inventory across the organisation: who holds Owner or
//        Editor, anything open to everyone on the internet, and service-account
//        keys and their age. Read-only, cached 30 minutes.
import { query as defaultQuery } from '../db.js'
import { callGoogle, onGoogleReset, soft, pages, listProjects } from './cloud.js'

const ORG = process.env.GCP_ORG_ID || '731915549550'
// The BigQuery project that runs the queries (the server account may run jobs there).
const JOB_PROJECT = 'chennai-rice-website'
// One dataset per billing account: My Billing Account, Firebase Payment.
export const BILLING_DATASETS = (process.env.CLOUD_BILLING_DATASETS || 'chennairice-website:billing_export,chennai-rice-website:billing_export_')
  .split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [project, dataset] = s.split(':'); return { project, dataset } })
const COMPANY_DOMAIN = 'chennairiceindustries.com'

const cache = new Map()
onGoogleReset(() => cache.clear())
async function cached(key, ms, fn) {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value
  const value = await fn()
  cache.set(key, { value, until: Date.now() + ms })
  return value
}

// ---- BigQuery -------------------------------------------------------------------------
/** The billing table of each dataset: the detailed one (cost per resource) when it exists, else the standard one. */
async function billingTables() {
  const found = []
  for (const d of BILLING_DATASETS) {
    const tables = await soft(pages(`https://bigquery.googleapis.com/bigquery/v2/projects/${d.project}/datasets/${d.dataset}/tables?maxResults=100`, 'tables'), [])
    const ids = tables.map((t) => t.tableReference?.tableId || '')
    const detailed = ids.find((id) => id.startsWith('gcp_billing_export_resource_v1_'))
    const standard = ids.find((id) => id.startsWith('gcp_billing_export_v1_'))
    if (detailed || standard) found.push({ ...d, table: detailed || standard, detailed: Boolean(detailed) })
  }
  return found
}

/** A standard-SQL query, its rows as plain objects. */
export async function bigQuery(sql) {
  const r = await callGoogle(`https://bigquery.googleapis.com/bigquery/v2/projects/${JOB_PROJECT}/queries`, {
    method: 'POST',
    body: { query: sql, useLegacySql: false, timeoutMs: 30_000, maximumBytesBilled: String(1_000_000_000) },
  })
  if (!r.jobComplete) throw new Error('The cost query is still running at Google. Try again in a minute.')
  const fields = r.schema?.fields?.map((f) => f.name) || []
  return (r.rows || []).map((row) => Object.fromEntries(fields.map((f, i) => [f, row.f[i]?.v ?? null])))
}

const source = (tables, cols) => tables.map((t) => `select ${cols} from \`${t.project}.${t.dataset}.${t.table}\``).join(' union all ')

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const sumBy = (rows, key) => {
  const m = new Map()
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + r.net)
  return [...m].map(([name, cost]) => ({ name, cost: r2(cost) })).sort((a, b) => b.cost - a.cost)
}
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
const addDays = (day, n) => new Date(new Date(day + 'T00:00:00Z').getTime() + n * 86_400_000).toISOString().slice(0, 10)

async function budgets(projectNumbers) {
  const accounts = await soft(pages('https://cloudbilling.googleapis.com/v1/billingAccounts?pageSize=50', 'billingAccounts'), [])
  const out = []
  for (const a of accounts) {
    const id = a.name.split('/')[1]
    const list = await soft(pages(`https://billingbudgets.googleapis.com/v1/billingAccounts/${id}/budgets?pageSize=50`, 'budgets'), [])
    for (const b of list) {
      const amount = b.amount?.specifiedAmount
      out.push({
        name: b.displayName || 'Budget', account: a.displayName || id, accountId: id,
        amount: amount ? Number(amount.units || 0) + Number(amount.nanos || 0) / 1e9 : null,
        currency: amount?.currencyCode || 'INR', lastPeriod: Boolean(b.amount?.lastPeriodAmount),
        projects: (b.budgetFilter?.projects || []).map((p) => projectNumbers[p.split('/')[1]] || p.split('/')[1]),
        thresholds: (b.thresholdRules || []).map((t) => Math.round(Number(t.thresholdPercent) * 100)),
      })
    }
  }
  return out
}

/** Cost for the last `days` days (1, 7, 30 or 90), with this month, last month, a forecast and the budgets. */
export async function cloudCosts({ query = defaultQuery, days: d } = {}) {
  const days = [1, 7, 30, 90].includes(Number(d)) ? Number(d) : 30
  const tables = await cached('tables', 10 * 60_000, billingTables)
  if (!tables.length) {
    // The budgets are already set, so they show (without spend) while the data is on its way.
    const projects = await cached('projects', 60 * 60_000, () => listProjects().catch(() => []))
    const list = await cached('budgets', 60 * 60_000, () => budgets(Object.fromEntries(projects.map((p) => [p.number, p.id]))))
    return {
      ready: false, days, datasets: BILLING_DATASETS, budgets: list.map((b) => ({ ...b, spent: null, share: null })),
      note: 'Google has not written the first billing data yet. It usually appears within a day of switching the export on, then updates several times a day.',
    }
  }
  let data
  try {
    data = await cached(`cost:${tables.map((t) => t.table).join()}`, 60 * 60_000, async () => {
    // 100 days by day, project, service and item: enough for any period, this month and last month.
    const rows = await bigQuery(`
      select project.id as project, service.description as service, sku.description as sku,
             format_date('%Y-%m-%d', date(usage_start_time, 'Asia/Kolkata')) as day, billing_account_id as account,
             sum(cost) as cost, sum(ifnull((select sum(c.amount) from unnest(credits) c), 0)) as credits, any_value(currency) as currency
        from (${source(tables, 'project, service, sku, usage_start_time, cost, credits, currency, billing_account_id')})
       where usage_start_time >= timestamp_sub(current_timestamp(), interval 100 day)
       group by 1, 2, 3, 4, 5`)
    const detailed = tables.filter((t) => t.detailed)
    const resources = detailed.length ? await bigQuery(`
      select project.id as project, service.description as service, resource.name as resource,
             sum(cost) + sum(ifnull((select sum(c.amount) from unnest(credits) c), 0)) as net
        from (${source(detailed, 'project, service, resource, usage_start_time, cost, credits')})
       where usage_start_time >= timestamp_sub(current_timestamp(), interval 30 day) and resource.name is not null
       group by 1, 2, 3 order by net desc limit 25`).catch(() => []) : []
    return { rows, resources, fetchedAt: new Date().toISOString() }
    })
  } catch (err) {
    console.error('[cloud cost]', err.message)
    return { ready: false, days, datasets: BILLING_DATASETS, error: `Could not read the billing data: ${err.message}` }
  }

  const rows = data.rows.map((r) => ({
    ...r, project: r.project || '(no project: billing account charges)',
    cost: Number(r.cost) || 0, credits: Number(r.credits) || 0, net: (Number(r.cost) || 0) + (Number(r.credits) || 0),
  }))
  const today = istToday()
  const from = addDays(today, -(days - 1))
  const prevFrom = addDays(from, -days)
  const inPeriod = rows.filter((r) => r.day >= from)
  const prev = rows.filter((r) => r.day >= prevFrom && r.day < from)
  const month = today.slice(0, 7)
  const lastMonthStart = addDays(month + '-01', -1).slice(0, 7)
  const mtd = rows.filter((r) => r.day.startsWith(month))
  const total = (list) => r2(list.reduce((a, r) => a + r.net, 0))
  const dayOfMonth = Number(today.slice(8, 10))
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const daily = []
  for (let day = from; day <= today; day = addDays(day, 1)) daily.push({ day, value: r2(inPeriod.filter((r) => r.day === day).reduce((a, r) => a + r.net, 0)) })

  // Budgets: this month's spend on the budget's projects (or the whole billing account).
  const projects = await cached('projects', 60 * 60_000, () => listProjects().catch(() => []))
  const numbers = Object.fromEntries(projects.map((p) => [p.number, p.id]))
  const budgetList = (await cached('budgets', 60 * 60_000, () => budgets(numbers))).map((b) => {
    const spent = total(mtd.filter((r) => (b.projects.length ? b.projects.includes(r.project) : r.account === b.accountId)))
    return { ...b, spent, share: b.amount ? spent / b.amount : null }
  })

  // Website cost per paid order: the two website projects against paid orders in the period.
  const site = total(inPeriod.filter((r) => ['chennai-rice-website', 'chennairice-website'].includes(r.project)))
  const { rows: [o] } = await query(
    `select count(*)::int as n from orders where payment_status in ('paid', 'partially_refunded')
        and (placed_at at time zone 'Asia/Kolkata')::date >= $1::date`, [from]).catch(() => ({ rows: [{ n: null }] }))

  return {
    ready: true, days, from, to: today, fetchedAt: data.fetchedAt,
    currency: rows.find((r) => r.currency)?.currency || 'INR',
    total: total(inPeriod), previous: total(prev), credits: r2(inPeriod.reduce((a, r) => a + r.credits, 0)),
    daily,
    byProject: sumBy(inPeriod, 'project'),
    byService: sumBy(inPeriod, 'service'),
    topItems: sumBy(inPeriod.map((r) => ({ ...r, item: `${r.service} · ${r.sku}` })), 'item').slice(0, 15),
    monthToDate: total(mtd), lastMonth: total(rows.filter((r) => r.day.startsWith(lastMonthStart))),
    forecast: r2((total(mtd) / dayOfMonth) * daysInMonth),
    budgets: budgetList,
    resources: data.resources.map((r) => ({ ...r, net: r2(r.net) })),
    website: { cost: site, paidOrders: o?.n ?? null, perOrder: o?.n ? r2(site / o.n) : null },
    tables: tables.map((t) => `${t.project}.${t.dataset}.${t.table}`),
  }
}

// ---- Security -------------------------------------------------------------------------
const projectOf = (resource) => resource.match(/projects\/([^/]+)/)?.[1] || ''
const KIND = (assetType) => ({
  'run.googleapis.com/Service': 'Cloud Run service', 'cloudfunctions.googleapis.com/CloudFunction': 'Cloud Function',
  'cloudfunctions.googleapis.com/Function': 'Cloud Function', 'storage.googleapis.com/Bucket': 'Storage bucket',
  'cloudresourcemanager.googleapis.com/Project': 'Project', 'cloudresourcemanager.googleapis.com/Organization': 'Organisation',
}[assetType] || assetType.split('/').pop())

/** Public Cloud Run services and functions are how websites are served; a public bucket or anything else needs a look. */
export function publicAccessRisk(assetType, roles) {
  const invokerOnly = roles.every((r) => /run\.invoker|cloudfunctions\.invoker/.test(r))
  if (/run\.googleapis\.com|cloudfunctions\.googleapis\.com/.test(assetType) && invokerOnly) return 'expected'
  return 'check'
}

export async function cloudSecurity() {
  return cached('security', 30 * 60_000, async () => {
    const scope = `organizations/${ORG}`
    const search = (q) => pages(`https://cloudasset.googleapis.com/v1/${scope}:searchAllIamPolicies?pageSize=200&query=${encodeURIComponent(q)}`, 'results')
    const [powerful, everyone, keys, accounts, projects] = await Promise.all([
      soft(search('policy:(roles/owner OR roles/editor)'), null),
      soft(search('policy:(allUsers OR allAuthenticatedUsers)'), null),
      soft(pages(`https://cloudasset.googleapis.com/v1/${scope}:searchAllResources?assetTypes=iam.googleapis.com/ServiceAccountKey&pageSize=200`, 'results'), null),
      soft(pages(`https://cloudasset.googleapis.com/v1/${scope}:searchAllResources?assetTypes=iam.googleapis.com/ServiceAccount&pageSize=200`, 'results'), []),
      listProjects().catch(() => []),
    ])
    const numbers = Object.fromEntries(projects.map((p) => [p.number, p.id]))
    const proj = (r) => numbers[String(r.project || '').split('/')[1]] || projectOf(r.resource || r.name || '')

    // Who holds Owner or Editor, and on what.
    const access = []
    for (const r of powerful || []) {
      for (const b of r.policy?.bindings || []) {
        if (!['roles/owner', 'roles/editor'].includes(b.role)) continue
        for (const m of b.members || []) {
          const [type, who] = m.split(':')
          const outside = type === 'user' && !who.toLowerCase().endsWith('@' + COMPANY_DOMAIN)
          access.push({
            where: KIND(r.assetType) === 'Organisation' ? 'Organisation' : proj(r), kind: KIND(r.assetType), role: b.role.replace('roles/', ''),
            member: who, type, outside,
            note: outside ? 'Personal or outside account with full control' : type === 'serviceAccount' && b.role === 'roles/editor' ? 'Service account with the broad Editor role' : '',
          })
        }
      }
    }
    access.sort((a, b) => Number(b.outside) - Number(a.outside) || a.where.localeCompare(b.where))

    // Anything anyone on the internet can reach.
    const open = (everyone || []).map((r) => {
      const roles = (r.policy?.bindings || []).filter((b) => (b.members || []).some((m) => /^(allUsers|allAuthenticatedUsers)$/.test(m))).map((b) => b.role)
      return { kind: KIND(r.assetType), name: (r.resource || '').split('/').pop(), project: proj(r), roles, risk: publicAccessRisk(r.assetType, roles) }
    }).sort((a, b) => (a.risk === 'check' ? -1 : 1) - (b.risk === 'check' ? -1 : 1))

    // Downloadable service-account keys and how old they are (Google's own keys are not listed here).
    const now = Date.now()
    const keyList = (keys || []).map((k) => ({
      account: (k.name || '').split('/serviceAccounts/')[1]?.split('/')[0] || '', project: proj(k),
      created: k.createTime || null, ageDays: k.createTime ? Math.floor((now - new Date(k.createTime).getTime()) / 86_400_000) : null,
    })).sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0))

    const findings = []
    for (const a of access.filter((x) => x.outside)) findings.push({ level: 'bad', text: `${a.member} has ${a.role} on ${a.where}: a personal or outside account with full control.` })
    for (const o of open.filter((x) => x.risk === 'check')) findings.push({ level: 'bad', text: `${o.kind} ${o.name} (${o.project}) is open to everyone on the internet (${o.roles.join(', ')}).` })
    for (const k of keyList.filter((x) => x.ageDays > 90)) findings.push({ level: 'warn', text: `Service-account key for ${k.account} is ${k.ageDays} days old: replace it, or delete it if unused.` })
    const editorSAs = access.filter((a) => a.type === 'serviceAccount' && a.role === 'editor')
    if (editorSAs.length) findings.push({ level: 'info', text: `${editorSAs.length} service accounts hold the broad Editor role (often Google's default accounts); narrower roles are safer.` })

    return {
      checkedAt: new Date().toISOString(),
      complete: { access: powerful !== null, public: everyone !== null, keys: keys !== null },
      findings, access, open, keys: keyList, serviceAccounts: accounts.length,
    }
  })
}
