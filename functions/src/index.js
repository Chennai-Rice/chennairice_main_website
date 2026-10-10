// Firebase Cloud Function: every /api route, as one function.
//
// Firebase Hosting serves the built site from dist/ and rewrites /api/** here
// (see firebase.json), so the Express app in backend/server/app.js answers in
// production exactly as it does against the local dev server. One function
// rather than one per route: the routes share all their setup, and a single
// warm instance serving every endpoint gives fewer cold starts than a dozen
// rarely-hit ones.
//
// Hosting passes the original URL through unchanged, so Express still sees
// /api/contact and its existing route table needs no adjustment.
import { onRequest } from 'firebase-functions/v2/https'
import { app } from '../../backend/server/app.js'

export const api = onRequest(
  {
    region: 'asia-south1',
    // The gateways and Supabase are all reached over the network, so these
    // spend most of their time waiting rather than computing.
    // Invoice PDFs and tracker spreadsheets are built in memory.
    memory: '512MiB',
    // Long enough for a Groq completion, which is the slowest thing here;
    // every payment call has its own 15s deadline well inside this.
    timeoutSeconds: 60,
    // Keeps the checkout and chat paths from paying a cold start on the first
    // request of a quiet period. Raise it if cold starts still show up.
    minInstances: 0,
    maxInstances: 10,
    // Plain settings come from functions/.env, which the Firebase CLI uploads
    // as environment variables on deploy (the file itself is git-ignored).
    // Passwords belong in Secret Manager instead, listed here:
    // SMTP_PASS: the support@ Google Workspace app password, used to send the
    // order emails (firebase functions:secrets:set SMTP_PASS).
    // DB_PASSWORD: the chennairice_app password for Cloud SQL, copied from the
    // database project's Secret Manager (infra/gcp/GO-LIVE.md, step 3).
    secrets: ['SMTP_PASS', 'DB_PASSWORD'],
    // Runs as the backend account that phase1-setup.ps1 allowed into Cloud SQL
    // (Cloud SQL client) and nothing else.
    serviceAccount: 'api-backend@chennai-rice-website.iam.gserviceaccount.com',
    invoker: 'public',
  },
  app
)

// Sales housekeeping every 10 minutes: expire unpaid orders (freeing their
// stock), remind the team about orders stuck at a step, low-stock warnings,
// and sending queued emails. Does nothing until the sales database is
// configured (CLOUD_SQL_INSTANCE), so deploying it early is harmless.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { hasDatabase } from '../../backend/lib/db.js'
import { runJobs } from '../../backend/lib/sales/jobs.js'

export const salesJobs = onSchedule(
  {
    schedule: 'every 10 minutes', region: 'asia-south1', timeZone: 'Asia/Kolkata', memory: '256MiB', timeoutSeconds: 120,
    secrets: ['SMTP_PASS', 'DB_PASSWORD'], // the database, and sending the queued emails
    serviceAccount: 'api-backend@chennai-rice-website.iam.gserviceaccount.com',
  },
  async () => {
    if (!hasDatabase()) return
    console.log('[salesJobs]', JSON.stringify(await runJobs()))
  }
)
