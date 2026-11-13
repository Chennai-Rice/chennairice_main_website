// Sends the Offers data to Sales Daddy once: everyone who spun the Spin & Win wheel (tag "Spin & Win",
// a note with the prize, code, valid till and whether it was used) and every Refer a friend customer
// (tag "Refer a friend", a note with their code, friends who ordered and rewards). New spins and
// referrals go to Sales Daddy by themselves; this is only for the ones from before.
// Sales Daddy finds a lead by mobile: a customer it already has gets the tag and the note, not a new lead.
//
//   node db/push-offers-to-crm.js            says what it would send, sends nothing
//   node db/push-offers-to-crm.js --apply    queues them and sends them (needs SALESDADDY_API_KEY;
//                                             without it the 10-minute job sends 20 every 10 minutes)
//
// Needs the database settings of db:migrate. Run it once: running it again adds the notes again.
import { closePool, query } from '../lib/db.js'
import { queueCrmLead, sendCrmLeads, crmEnabled, isBlockedMobile } from '../lib/crm.js'

const apply = process.argv.includes('--apply')
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '')
const rs = (paise) => '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const { rows: spins } = await query(
  `select sp.phone, sp.name, sp.email, sp.prize_label, sp.created_at, d.code, d.expires_at, d.min_order_paise,
          (select o.order_number from orders o where o.discount_code_id = d.id and o.status not in ('pending_payment', 'cancelled')
            order by o.placed_at limit 1) as used_on
     from spins sp left join discount_codes d on d.id = sp.code_id order by sp.created_at`)
const { rows: refs } = await query(
  `select r.id, r.phone, r.name, r.email, r.created_at, d.code,
          (select count(*)::int from orders o where o.referrer_id = r.id and o.status not in ('pending_payment', 'cancelled')) as friends,
          (select count(*)::int from referral_rewards w where w.referrer_id = r.id and w.status = 'issued') as rewards
     from referrers r join discount_codes d on d.id = r.code_id order by r.created_at`)

const leads = []
for (const s of spins) {
  const used = s.used_on ? `used on order ${s.used_on}` : s.expires_at && new Date(s.expires_at) < new Date() ? 'expired, not used' : 'not used yet'
  leads.push(['spin_wheel', {
    name: s.name || 'Spin & Win customer', phone: s.phone, email: s.email || undefined, source: 'website',
    note: `Spin & Win (${day(s.created_at)}): won ${s.prize_label}` + (s.code ? `, code ${s.code}` : '') +
      (Number(s.min_order_paise) > 0 ? ` on orders above ${rs(s.min_order_paise)}` : '') +
      (s.expires_at ? `, valid till ${day(s.expires_at)}` : '') + ` (${used}).`,
  }])
}
for (const r of refs) {
  leads.push(['referral', {
    name: r.name || 'Refer a friend customer', phone: r.phone, email: r.email || undefined, source: 'website',
    note: `Refer a friend (since ${day(r.created_at)}): referral code ${r.code}. Friends who ordered: ${r.friends}. Rewards earned: ${r.rewards}.`,
  }])
}
const ok = leads.filter(([, f]) => /^[6-9]\d{9}$/.test(f.phone) && !isBlockedMobile(f.phone))
console.log(`Spin & Win: ${spins.length} · Refer a friend: ${refs.length} · to send: ${ok.length} (skipped ${leads.length - ok.length}: not a mobile or a company number)`)

if (!apply) {
  console.log('Nothing sent. Run again with --apply to send them to Sales Daddy.')
} else {
  let queued = 0
  for (const [kind, f] of ok) if (await queueCrmLead(kind, f, { query })) queued++
  console.log(`Queued ${queued}.`)
  if (crmEnabled()) {
    let sent = 0, failed = 0
    for (;;) {
      const r = await sendCrmLeads({ query, limit: 20 })
      sent += r.sent || 0
      failed += r.failed || 0
      if (!r.sent && !r.failed) break
      process.stdout.write(`\rSent ${sent}, failed ${failed}…`)
    }
    console.log(`\nDone: sent ${sent}, failed ${failed} (failed ones are retried by the 10-minute job).`)
  } else {
    console.log('No SALESDADDY_API_KEY here: the website sends them, 20 every 10 minutes.')
  }
}
await closePool()
