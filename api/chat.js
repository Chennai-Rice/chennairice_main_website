// Vercel deployment shim — not application code.
//
// Vercel discovers serverless functions only in /api at the project root, and
// that location is not configurable. The handler itself lives with the rest of
// the server code in backend/functions/; this file exists so the platform can
// find it. Edit the real handler, not this.
export { default } from '../backend/functions/chat.js'
