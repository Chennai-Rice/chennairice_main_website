// Server-side Supabase client, shared by the enquiry endpoints (api/contact.js,
// api/bulk-order.js) and their local dev mirrors in backend/server/index.js. Uses the
// service role key, which bypasses RLS — this file must only ever run
// server-side, never be imported into browser code.
import { createClient } from '@supabase/supabase-js'
// The client always builds a Realtime client, which needs a WebSocket
// constructor. These endpoints never open one (only .from().insert() is
// used), but Node < 22 has no native WebSocket, so `ws` satisfies the
// constructor check without ever being connected.
import WebSocket from 'ws'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket },
    })
  : null
