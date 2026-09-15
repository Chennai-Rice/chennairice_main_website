// Browser-safe Supabase client — uses the PUBLIC anon/publishable key only.
//
// This is the client-side counterpart to api/_lib/supabase.js, which uses the
// service role key and must only ever run server-side. This file is imported
// by browser code (React components, src/services/*), so it must never touch
// SUPABASE_SERVICE_ROLE_KEY.
//
// The anon key is safe to expose in bundled frontend code by design — it
// identifies the project, not a privileged caller. Every table it can reach
// is protected by Postgres Row Level Security (RLS) policies (see the
// `products`/`product_variants`/`categories` public-read policies, and the
// `authenticated`-only, own-row policies on `carts`, `orders`, etc.). Never
// relax RLS to compensate for using this client — add a real policy instead.
//
// Vite convention: only import.meta.env vars prefixed VITE_ are exposed to
// browser code (see vite.config.js and the project's .env.local.example).
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

if (!hasSupabase && import.meta.env.DEV) {
  // Loud in dev, silent in production builds — a missing key should not
  // spam the console for every visitor, but should be obvious to a developer.
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — ' +
      'Supabase-backed features (products, cart sync, auth) will be unavailable. ' +
      'See .env.local.example.'
  )
}

/**
 * Shared browser Supabase client. `null` when the env vars are missing, so
 * callers must check `hasSupabase` (or handle a null client) rather than
 * assume this is always usable — the site must keep working (static content,
 * localStorage cart) even when Supabase isn't configured for a given deploy.
 */
export const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
