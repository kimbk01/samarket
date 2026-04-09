import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env/runtime";

let cachedSupabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cachedSupabase) return cachedSupabase;

  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    throw new Error(supabaseEnv.error);
  }

  cachedSupabase = createClient(supabaseEnv.url, supabaseEnv.anonKey);
  return cachedSupabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});