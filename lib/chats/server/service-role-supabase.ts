import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export function getChatServiceRoleSupabase():
  | SupabaseClient<any>
  | null {
  return tryCreateSupabaseServiceClient() as SupabaseClient<any> | null;
}
