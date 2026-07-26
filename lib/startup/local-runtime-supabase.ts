/**
 * Local Runtime Supabase client — token/session in localStorage (no Remote HTML).
 * Uses injected window keys or build-time env; never service-role.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function createLocalRuntimeSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (typeof window === "undefined") {
    client = null;
    return null;
  }
  const url =
    window.__DIBAY_SUPABASE_URL__?.trim() ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() : "") ||
    "";
  const key =
    window.__DIBAY_SUPABASE_ANON_KEY__?.trim() ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() : "") ||
    "";
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });
  return client;
}
