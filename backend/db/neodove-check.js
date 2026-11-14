// Read-only: today's sign-ups and enquiries against what went to NeoDove (outbox), and the last few leads.
//   node db/neodove-check.js        (database settings of db:migrate in the environment)
import { closePool, query } from '../lib/db.js'

const IST = "at time zone 'Asia/Kolkata'"
try {
  const today = `(created_at ${IST})::date = (now() ${IST})::date`
  const signups = await query(`select count(*)::int as n from contest_leads where ${today}`)
  const outbox = await query(`select campaign, coalesce(agent, '-') as agent, status, count(*)::int as n
                                from neodove_outbox where ${today} group by 1, 2, 3 order by 1, 2, 3`)
  const last = await query(`select to_char(created_at ${IST}, 'DD Mon HH24:MI') as at, campaign, agent, status, attempts,
                                   left(coalesce(last_error, ''), 120) as error, right(mobile, 4) as mobile_end
                              from neodove_outbox order by created_at desc limit 12`)
  const leads = await query(`select to_char(l.created_at ${IST}, 'DD Mon HH24:MI') as at, l.source, right(l.mobile, 4) as mobile_end,
                                    (select o.status from neodove_outbox o where o.mobile = l.mobile order by o.created_at desc limit 1) as neodove
                               from contest_leads l order by l.created_at desc limit 12`)
  console.log('Sign-ups today:', signups.rows[0].n)
  console.log('NeoDove outbox today:'); console.table(outbox.rows)
  console.log('Last 12 in the NeoDove outbox:'); console.table(last.rows)
  console.log('Last 12 sign-ups and their NeoDove status:'); console.table(leads.rows)
} finally {
  await closePool()
}
