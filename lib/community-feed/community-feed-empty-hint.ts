import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * 섹션·글이 모두 비었을 때 사용자에게 보여 줄 점검 안내 (운영/로컬 차이 진단용)
 */
export async function getCommunityFeedEmptyHint(): Promise<string | null> {
  try {
    getSupabaseServer();
  } catch {
    return "Vercel(또는 배포 환경)에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 Production에 설정돼 있는지 확인하세요. 키가 없으면 서버가 DB에 연결하지 못합니다.";
  }

  try {
    const sb = getSupabaseServer();
    const { error } = await sb.from("community_sections").select("id").limit(1);
    if (error) {
      const m = (error.message ?? "").toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find")) {
        return null;
      }
      return `Supabase 응답: ${String(error.message).slice(0, 240)}`;
    }
    return "테이블은 있으나 활성 섹션이 없습니다. 로컬 .env의 Supabase 프로젝트와 Vercel에 넣은 프로젝트가 같은지 확인한 뒤, 프로덕션 DB에도 동일 마이그레이션 SQL을 실행하세요.";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg ? msg.slice(0, 240) : null;
  }
}
