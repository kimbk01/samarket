import { getSupabaseServer } from "@/lib/chat/supabase-server";

/** 서버 환경변수 없으면 null (로컬·미설정 시 API가 빈 목록 반환) */
export function tryGetSupabaseForStores(): ReturnType<typeof getSupabaseServer> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}
