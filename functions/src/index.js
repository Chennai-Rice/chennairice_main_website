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
    memory: '256MiB',
    // Long enough for a Groq completion, which is the slowest thing here;
    // every payment call has its own 15s deadline well inside this.
    timeoutSeconds: 60,
    // Keeps the checkout and chat paths from paying a cold start on the first
    // request of a quiet period. Raise it if cold starts still show up.
    minInstances: 0,
    maxInstances: 10,
    // Secrets are provided as environment variables through Firebase's secret
    // manager — see the deploy notes in README terms; nothing is read from a
    // .env file here, because .env files are not deployed.
    invoker: 'public',
  },
  app
)
