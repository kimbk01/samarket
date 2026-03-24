import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스 롤 클라이언트 (없으면 null) — 서버 컴포넌트에서 RLS 우회 조회용
 */
export function tryCreateSupabaseServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceKey?.trim()) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
