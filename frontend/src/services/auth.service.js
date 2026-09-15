// Minimal wrapper around Supabase Auth. There is no login/signup UI in this
// app yet, so nothing here is called from anywhere today — but Supabase Auth
// itself (auth.users, the `profiles` table keyed to it, RLS policies that
// check auth.uid()) is already part of the schema, so this gives a future
// login/signup UI a ready, thin call site instead of inline
// supabase.auth.* calls scattered through components.
import { supabase, hasSupabase } from '../lib/supabaseClient.js'

function assertSupabase() {
  if (!hasSupabase) {
    throw new Error(
      'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — ' +
        'see .env.local.example.'
    )
  }
}

/**
 * Create a new account.
 * @param {{ email: string, password: string, fullName?: string }} params
 * @returns {Promise<import('@supabase/supabase-js').AuthResponse['data']>}
 */
export async function signUp({ email, password, fullName }) {
  assertSupabase()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  })
  if (error) throw error
  return data
}

/**
 * Sign in with email + password.
 * @param {{ email: string, password: string }} params
 * @returns {Promise<import('@supabase/supabase-js').AuthTokenResponsePassword['data']>}
 */
export async function signIn({ email, password }) {
  assertSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/** Sign the current user out. */
export async function signOut() {
  assertSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * The current session's user, or null if signed out.
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getCurrentUser() {
  assertSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user ?? null
}
