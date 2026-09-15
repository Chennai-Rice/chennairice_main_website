// One-off helper: exchange a Zoho Self Client authorization code for a refresh
// token, and write it (plus the client id/secret) into backend/server/.env.
//
// Run this once when setting up Zoho Payments, and again only if the refresh
// token is revoked. Refresh tokens do not expire on their own.
//
//   node zoho-refresh-token.mjs --code <CODE>
//
// Client id and secret are read from backend/server/.env when already saved there;
// pass --id / --secret to override.
//
// The authorization code from api-console.zoho.in is valid for a few minutes
// only, so generate it immediately before running this. The refresh token that
// comes back is long-lived and is what the server actually uses — see
// backend/lib/zohoPayments.js, which trades it for an hourly access token.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = join(here, '.env')

function arg(name) {
  const index = process.argv.indexOf('--' + name)
  return index > -1 ? process.argv[index + 1] : undefined
}

// Read backend/server/.env up front so --id and --secret can be omitted once they are
// saved there — after the first setup the only thing that changes is the code.
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
function fromEnvFile(key) {
  const match = envText.match(new RegExp('^' + key + '=(.*)$', 'm'))
  return match ? match[1].trim() : undefined
}

const clientId = arg('id') || fromEnvFile('ZOHO_PAYMENTS_CLIENT_ID')
const clientSecret = arg('secret') || fromEnvFile('ZOHO_PAYMENTS_CLIENT_SECRET')
const code = arg('code')
// Accounts host follows the data centre, and must match the console the code
// was generated in (.in for an India account).
const domain = (arg('domain') || process.env.ZOHO_PAYMENTS_DOMAIN || 'IN').toUpperCase()

const ACCOUNTS = {
  IN: 'https://accounts.zoho.in',
  US: 'https://accounts.zoho.com',
  EU: 'https://accounts.zoho.eu',
  AU: 'https://accounts.zoho.com.au',
}

if (!clientId || !clientSecret || !code) {
  console.error('Usage: node zoho-refresh-token.mjs --code <CODE> [--id <CLIENT_ID>] [--secret <CLIENT_SECRET>] [--domain IN]')
  if (!code) console.error('  --code is required: generate a fresh one at api-console.zoho.in (Self Client -> Generate Code).')
  if (!clientId || !clientSecret) console.error('  Client id/secret not found in backend/server/.env — pass --id and --secret.')
  process.exit(1)
}

/** Replace KEY=... in .env, or append it when the key is not there yet. */
function setEnvValue(contents, key, value) {
  const pattern = new RegExp('^' + key + '=.*$', 'm')
  if (pattern.test(contents)) return contents.replace(pattern, key + '=' + value)
  return contents.replace(/\n*$/, '\n') + key + '=' + value + '\n'
}

const res = await fetch((ACCOUNTS[domain] || ACCOUNTS.IN) + '/oauth/v2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
  }),
})

const data = await res.json().catch(() => ({}))

// Zoho answers 200 with an `error` field for an expired or reused code, so the
// status code alone cannot be read as success.
if (!res.ok || data.error || !data.refresh_token) {
  console.error('Token exchange failed:', data.error || JSON.stringify(data))
  if (data.error === 'invalid_code') {
    console.error('That code has expired or was already used — generate a fresh one and retry.')
  }
  process.exit(1)
}

if (!existsSync(ENV_PATH)) {
  console.error('No backend/server/.env found. Copy backend/server/.env.example to backend/server/.env first.')
  process.exit(1)
}

let env = readFileSync(ENV_PATH, 'utf8')
env = setEnvValue(env, 'ZOHO_PAYMENTS_CLIENT_ID', clientId)
env = setEnvValue(env, 'ZOHO_PAYMENTS_CLIENT_SECRET', clientSecret)
env = setEnvValue(env, 'ZOHO_PAYMENTS_REFRESH_TOKEN', data.refresh_token)
writeFileSync(ENV_PATH, env)

console.log('Wrote ZOHO_PAYMENTS_CLIENT_ID, CLIENT_SECRET and REFRESH_TOKEN to backend/server/.env')
console.log('Refresh token: ' + data.refresh_token.slice(0, 12) + '... (' + data.refresh_token.length + ' chars)')
console.log('Scope granted: ' + (data.scope || '(not reported)'))
console.log('\nStill needed: ZOHO_PAYMENTS_ACCOUNT_ID (Settings -> Account Details)')
console.log('and ZOHO_PAYMENTS_SIGNING_KEY (Settings -> Developer Space).')
console.log('Restart the server to pick these up.')
