import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스 롤 클라이언트.
 * DB에 대한 생성된 `Database` 타입이 없으면 `.from()` 체인이 `never`로 굳어져 빌드가 깨지므로,
 * 서버 전용으로는 스키마를 `any`로 둡니다. (클라이언트 `getSupabaseClient`와 별개)
 */
export function getSupabaseServer(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient<any>(url, serviceKey, { auth: { persistSession: false } });
}

export type SupabaseServer = SupabaseClient<any>;
