// A real PostgreSQL 16 server on this machine, for local development.
//
//   npm run db:start
//
// No install, no Docker: embedded-postgres ships the official binaries. Data
// lives in backend/.data/pg (git-ignored) and survives restarts. On first run
// the database is created, migrated and seeded with demo prices and stock.
// Leave it running and put the printed DATABASE_URL in backend/server/.env.
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { runMigrations } from './migrate.js'
import { seed } from './seed.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(ROOT, '..', '.data', 'pg')
const PORT = Number(process.env.DEV_DB_PORT) || 5433
const DB = 'chennairice'

const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))
const server = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  // Local-only server bound to localhost; not a secret worth protecting.
  password: 'postgres',
  port: PORT,
  persistent: true,
})

if (firstRun) await server.initialise()
await server.start()

const admin = new pg.Client({ host: 'localhost', port: PORT, user: 'postgres', password: 'postgres', database: 'postgres' })
await admin.connect()
const exists = await admin.query('select 1 from pg_database where datname = $1', [DB])
// UTF-8 like Cloud SQL; Windows would otherwise default to WIN1252, which cannot hold ₹.
if (!exists.rowCount) await admin.query('create database ' + DB + " encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'")
await admin.end()

const url = `postgres://postgres:postgres@localhost:${PORT}/${DB}`
const pool = new pg.Pool({ connectionString: url })
await runMigrations({ pool })
await seed({ pool, demo: firstRun })
await pool.end()

console.log('\nPostgreSQL 16 is running.')
console.log('  DATABASE_URL=' + url)
console.log('Press Ctrl+C to stop.\n')

const stop = async () => {
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
