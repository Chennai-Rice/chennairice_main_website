// Local development server. Binds the Express app in app.js to a port and
// reports which services are configured, so a missing key is obvious at
// startup rather than at the first failed request.
//
// In production these same routes run as a Firebase Cloud Function (see
// functions/index.js) or as Vercel functions; nothing here runs there.
import 'dotenv/config'
import { app } from './app.js'
import { availableGateways } from '../lib/gateways.js'

const PORT = process.env.PORT || 8787

app.listen(PORT, () => {
  console.log(`Soru Kutty chat proxy listening on http://localhost:${PORT}`)
  // Read here rather than imported from app.js: this banner only reports what
  // is configured, and the route that actually needs the key checks it itself.
  if (!process.env.GROQ_API_KEY) {
    console.warn('WARNING: GROQ_API_KEY is not set. Add it to backend/server/.env')
  }
  // Which gateways are live, and in what order, is the single most useful
  // thing to see at startup — a silent failover is otherwise invisible.
  const gateways = availableGateways()
  if (!gateways.length) {
    console.warn('WARNING: no payment gateway is configured. Checkout will return 503. See backend/server/.env.example')
  } else {
    const names = gateways.map((g, i) => (i === 0 ? g.label + ' (primary)' : g.label + ' (fallback)'))
    console.log('Payments: ' + names.join(' -> '))
    for (const g of gateways) {
      // Test vs live is the one thing worth being loud about — a mixup is
      // otherwise invisible until real money moves.
      console.log('  ' + g.label + ': ' + (g.testMode() ? 'TEST MODE' : 'LIVE (real money)'))
    }
  }
})
