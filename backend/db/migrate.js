// Applies backend/db/migrations/*.sql in name order, each exactly once.
//
//   npm run db:migrate                 (uses DATABASE_URL / CLOUD_SQL_INSTANCE)
//
// Against Cloud SQL, run it as the admin user (DB_USER=chennairice_admin with
// its password) and set DB_APP_ROLE=chennairice_app so the website's own login
// is granted read/write on the tables — but cannot drop or alter them.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, closePool } from '../lib/db.js'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function runMigrations({ pool, appRole = process.env.DB_APP_ROLE, log = console.log } = {}) {
  pool = pool || (await getPool())
  await pool.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`)

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await pool.query('select name from schema_migrations')
  const done = new Set(rows.map((r) => r.name))
  const applied = []

  for (const file of files) {
    if (done.has(file)) continue
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      applied.push(file)
      log('  applied ' + file)
    } catch (err) {
      await client.query('rollback').catch(() => {})
      err.message = file + ': ' + err.message
      throw err
    } finally {
      client.release()
    }
  }

  if (appRole) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(appRole)) throw new Error('DB_APP_ROLE is not a valid role name.')
    await pool.query(`grant usage on schema public to ${appRole}`)
    await pool.query(`grant select, insert, update, delete on all tables in schema public to ${appRole}`)
    await pool.query(`grant usage, select on all sequences in schema public to ${appRole}`)
    await pool.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${appRole}`)
    await pool.query(`alter default privileges in schema public grant usage, select on sequences to ${appRole}`)
    log('  granted read/write to ' + appRole)
  }

  if (!applied.length) log('  database already up to date')
  return applied
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Migration failed:', err.message)
      await closePool()
      process.exit(1)
    })
}
