// Makes the website's database login (chennairice_app) a plain data login.
//
// Why: logins made with `gcloud sql users create` are put in Cloud SQL's
// cloudsqlsuperuser group. That group owns the database, and through it the
// `public` schema, and a schema's owner may drop anything inside it. So the
// website login could drop tables. This script, run as chennairice_admin:
//   1. hands the public schema to chennairice_admin (the owner of the tables)
//   2. creates chennairice_app afresh in SQL, outside cloudsqlsuperuser
//      (the old gcloud-made login must be deleted first; phase2b does that)
//   3. grants it read/write on the data and nothing else
//   4. proves it: can read and write, cannot drop, alter or create roles
//
// Passwords come in through the environment and are never printed:
//   ADMIN_PASSWORD   chennairice_admin's (Secret Manager db-admin-password)
//   APP_PASSWORD     the new password for chennairice_app (already saved as a
//                    new version of Secret Manager db-app-password)
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../backend/package.json', import.meta.url))
const pg = require('pg')
const { Connector, IpAddressTypes } = require('@google-cloud/cloud-sql-connector')

const INSTANCE = 'chennairice-website:asia-south1:chennairice-db'
const DB = 'chennairice'
const APP = 'chennairice_app'

const connector = new Connector()
const opts = await connector.getOptions({ instanceConnectionName: INSTANCE, ipType: IpAddressTypes.PUBLIC })
const connect = async (user, password) => {
  const c = new pg.Client({ ...opts, user, password, database: DB })
  await c.connect()
  return c
}

// --release: before the gcloud-made login can be deleted, take back what the
// migration granted it (table, sequence and schema rights, default rights).
// PostgreSQL refuses to drop a role that still holds any. No data is touched:
// the tables belong to chennairice_admin. It also checks the login owns
// nothing itself, so deleting it can never take a table with it.
if (process.argv.includes('--release')) {
  const admin = await connect('chennairice_admin', process.env.ADMIN_PASSWORD)
  try {
    const exists = await admin.query('select 1 from pg_roles where rolname = $1', [APP])
    if (!exists.rowCount) {
      console.log('  ' + APP + ' not present, nothing to release')
    } else {
      const { rows: [{ n }] } = await admin.query(
        `select count(*)::int n from pg_class c join pg_roles r on r.oid = c.relowner where r.rolname = $1`, [APP])
      if (n) {
        console.error(`  ${APP} owns ${n} tables or sequences; stopping so nothing is lost. Ask for help.`)
        process.exit(1)
      }
      await admin.query('begin')
      await admin.query(`revoke all on all tables in schema public from ${APP}`)
      await admin.query(`revoke all on all sequences in schema public from ${APP}`)
      await admin.query(`revoke all on schema public from ${APP}`)
      await admin.query(`revoke all on database ${DB} from ${APP}`)
      await admin.query(`alter default privileges for role chennairice_admin in schema public revoke all on tables from ${APP}`)
      await admin.query(`alter default privileges for role chennairice_admin in schema public revoke all on sequences from ${APP}`)
      await admin.query('commit')
      console.log('  rights taken back from ' + APP + ' (it is re-granted in the next step)')
    }
  } catch (err) {
    await admin.query('rollback').catch(() => {})
    throw err
  } finally {
    await admin.end()
    connector.close()
  }
  process.exit(0)
}

let failed = false
const admin = await connect('chennairice_admin', process.env.ADMIN_PASSWORD)
try {
  await admin.query('begin')
  await admin.query('alter schema public owner to chennairice_admin')
  const exists = await admin.query('select 1 from pg_roles where rolname = $1', [APP])
  const pw = admin.escapeLiteral(process.env.APP_PASSWORD)
  if (exists.rowCount) {
    // Still there (e.g. a re-run after success): only reset its password.
    await admin.query(`alter role ${APP} with login password ${pw}`)
  } else {
    await admin.query(`create role ${APP} with login password ${pw} nosuperuser nocreatedb nocreaterole noinherit`)
  }
  await admin.query(`grant connect on database ${DB} to ${APP}`)
  await admin.query(`grant usage on schema public to ${APP}`)
  await admin.query(`grant select, insert, update, delete on all tables in schema public to ${APP}`)
  await admin.query(`grant usage, select on all sequences in schema public to ${APP}`)
  await admin.query(`alter default privileges for role chennairice_admin in schema public grant select, insert, update, delete on tables to ${APP}`)
  await admin.query(`alter default privileges for role chennairice_admin in schema public grant usage, select on sequences to ${APP}`)
  await admin.query('commit')
  console.log('  public schema now owned by chennairice_admin')
  console.log('  ' + APP + (exists.rowCount ? ' password reset' : ' created outside cloudsqlsuperuser') + ', read/write granted')
} catch (err) {
  await admin.query('rollback').catch(() => {})
  throw err
} finally {
  await admin.end()
}

// Prove it, as the website will connect.
const app = await connect(APP, process.env.APP_PASSWORD)
try {
  const groups = await app.query(
    `select coalesce(array_agg(g.rolname), '{}') g from pg_auth_members m join pg_roles g on g.oid = m.roleid
      where m.member = (select oid from pg_roles where rolname = current_user)`)
  console.log('  groups of ' + APP + ':', JSON.stringify(groups.rows[0].g))
  const n = await app.query('select count(*)::int n from products')
  console.log('  read: ok (' + n.rows[0].n + ' products)')
  await app.query('begin')
  await app.query(`insert into email_outbox (to_email, subject, body_text, template) values ('check@example.com', 'check', 'x', 'check')`)
  await app.query('rollback')
  console.log('  write: ok (test row rolled back)')
  for (const [label, sql] of [
    ['drop a table', 'drop table email_outbox'],
    ['alter a table', 'alter table products add column x int'],
    ['create a table', 'create table t_check (x int)'],
    ['create a login', 'create role r_check login'],
  ]) {
    await app.query('begin')
    try {
      await app.query(sql)
      console.log('  ' + label + ': ALLOWED  <-- PROBLEM')
      failed = true
    } catch {
      console.log('  ' + label + ': refused (as intended)')
    }
    await app.query('rollback')
  }
} finally {
  await app.end()
  connector.close()
}
if (failed) process.exit(1)
