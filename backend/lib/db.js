// PostgreSQL connection for the sales backend.
//
// Two ways to connect, picked from the environment:
//
//   Local / tests   DATABASE_URL=postgres://user:pass@localhost:5433/chennairice
//                   (npm run db:start in backend/ prints one for you)
//
//   Production      CLOUD_SQL_INSTANCE=chennairice-website:asia-south1:chennairice-db
//                   DB_NAME=chennairice
//                   DB_USER=chennairice_app   + DB_PASSWORD (from Secret Manager)
//                   — or —
//                   DB_AUTH=iam  DB_USER=api-backend@chennai-rice-website.iam
//                   (no password at all: the function's service account signs in)
//
// The Cloud SQL connector opens an encrypted tunnel authorised by the caller's
// Google identity, which is why the instance needs no public IP allow-list.
import pg from 'pg'

// int8 (bigint) arrives as a string by default because it can exceed 2^53.
// Every bigint here is money in paise or an identity column, both far below
// that, so numbers are safe and far less error-prone than strings.
pg.types.setTypeParser(20, (value) => Number(value))
// numeric — pack sizes like 10.00
pg.types.setTypeParser(1700, (value) => Number(value))
// date — kept as 'YYYY-MM-DD'. Turning it into a JS Date would pin it to
// midnight in the server's time zone and shift it by a day in UTC.
pg.types.setTypeParser(1082, (value) => value)

let poolPromise = null
let connector = null

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL || process.env.CLOUD_SQL_INSTANCE)
}

async function createPool() {
  const max = Number(process.env.DB_POOL_MAX) || 5

  if (process.env.DATABASE_URL) {
    return new pg.Pool({ connectionString: process.env.DATABASE_URL, max })
  }

  const instance = process.env.CLOUD_SQL_INSTANCE
  if (!instance) {
    const err = new Error('No database configured (DATABASE_URL or CLOUD_SQL_INSTANCE).')
    err.status = 503
    err.publicMessage = 'Ordering is temporarily unavailable. Please try again shortly.'
    throw err
  }

  const { Connector, IpAddressTypes, AuthTypes } = await import('@google-cloud/cloud-sql-connector')
  connector = new Connector()
  const iam = String(process.env.DB_AUTH || '').toLowerCase() === 'iam'
  const clientOptions = await connector.getOptions({
    instanceConnectionName: instance,
    ipType: process.env.DB_IP_TYPE === 'PRIVATE' ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    ...(iam ? { authType: AuthTypes.IAM } : {}),
  })

  return new pg.Pool({
    ...clientOptions,
    user: process.env.DB_USER || 'chennairice_app',
    ...(iam ? {} : { password: process.env.DB_PASSWORD }),
    database: process.env.DB_NAME || 'chennairice',
    max,
    // Cloud Functions freeze idle instances; a short idle timeout stops the
    // pool handing out sockets the server already closed.
    idleTimeoutMillis: 30000,
  })
}

export async function getPool() {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null
      throw err
    })
  }
  return poolPromise
}

/** One-off query on a pooled connection. */
export async function query(text, params) {
  const pool = await getPool()
  return pool.query(text, params)
}

/**
 * Run `fn(client)` inside a transaction. Commits if it resolves, rolls back if
 * it throws. Everything that changes money or stock goes through here, so a
 * failure half-way never leaves stock reserved for an order that does not exist.
 */
export async function tx(fn) {
  const pool = await getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise.catch(() => null)
    poolPromise = null
    if (pool) await pool.end()
  }
  if (connector) {
    connector.close()
    connector = null
  }
}
