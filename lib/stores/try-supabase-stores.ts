import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * 어드민·매장 API와 동일한 서비스 롤 클라이언트 (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
 * 미설정 시 null → 홈 피드·browse·상세는 빈 목록/연결 안내만 반환.
 */
export function tryGetSupabaseForStores(): ReturnType<typeof getSupabaseServer> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}
