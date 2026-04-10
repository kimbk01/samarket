import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getChatServiceRoleSupabase():
  | SupabaseClient<any>
  | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } }) as SupabaseClient<any>;
}
