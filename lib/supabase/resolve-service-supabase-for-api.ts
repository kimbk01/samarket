import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * Route Handler·서버 유틸 공통: `.env` 서비스 롤이 있으면 우선, 없으면 `getSupabaseServer()` (엄격 env)
 */
export function resolveServiceSupabaseForApi(): SupabaseClient<any> | null {
  const direct = tryCreateSupabaseServiceClient();
  if (direct) return direct;
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}
