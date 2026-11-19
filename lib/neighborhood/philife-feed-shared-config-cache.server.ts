import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * 동네 피드 고정값 3개 — 서버 인스턴스 공유 캐시 (2026-11-20 · Owner 「구현 승인」).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/neighborhood-feed-budget-design-2026-11-20.md
 *
 * 운영 실측(11-19): `/api/philife/neighborhood-feed` 1요청당 주제 RPC 0.69 · 가져오기 계정 0.61 · 동네 표 0.98 —
 * 값은 거의 안 바뀌는데 인스턴스 메모리에만 두어 새 인스턴스마다 다시 읽었다.
 * → Next Data Cache(인스턴스 공유, #497 상단 후보와 같은 방식). 읽기 실패는 캐시하지 않는다(throw → 호출부 기존 경로).
 */
export const PHILIFE_FEED_TOPICS_CACHE_TAG = "philife-feed-section-topics";
export const COMMUNITY_IMPORT_PRINCIPAL_CACHE_TAG = "community-import-principal";
export const NEIGHBORHOOD_LOCATIONS_CACHE_TAG = "neighborhood-locations";

/** 관리자 주제 저장 뒤 즉시 만료 — 그 전에도 5분이면 자연 만료 */
export const PHILIFE_FEED_TOPICS_REVALIDATE_SEC = 300;
/** 가져오기 계정은 운영 작업으로만 바뀜 */
export const COMMUNITY_IMPORT_PRINCIPAL_REVALIDATE_SEC = 3600;
/** 동네 표(26행) — 새 시/군 행은 계산 id 를 쓰므로 목록 반영이 늦어도 결과 같음(lgu-location.server.ts M3) */
export const NEIGHBORHOOD_LOCATIONS_REVALIDATE_SEC = 300;

/** `philife_list_default_section_topics_for_feed` 원본 응답(가공 전) */
export const loadPhilifeFeedTopicsRpcRootShared = unstable_cache(
  async (): Promise<unknown> => {
    const { data, error } = await getSupabaseServer().rpc("philife_list_default_section_topics_for_feed");
    if (error) throw new Error(error.message || "topics_rpc_failed");
    if (data == null) throw new Error("topics_rpc_empty");
    return data;
  },
  ["philife-feed-section-topics-rpc:v1"],
  { revalidate: PHILIFE_FEED_TOPICS_REVALIDATE_SEC, tags: [PHILIFE_FEED_TOPICS_CACHE_TAG] }
);

/** `community_import_principal.user_id` — 행이 없으면 빈 문자열 */
export const loadCommunityImportPrincipalUserIdShared = unstable_cache(
  async (): Promise<string> => {
    const { data, error } = await getSupabaseServer()
      .from("community_import_principal")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || "principal_failed");
    return String((data as { user_id?: string } | null)?.user_id ?? "").trim();
  },
  ["community-import-principal:v1"],
  { revalidate: COMMUNITY_IMPORT_PRINCIPAL_REVALIDATE_SEC, tags: [COMMUNITY_IMPORT_PRINCIPAL_CACHE_TAG] }
);

/** `locations` 의 id·city·name 전부(시/군 묶음 계산용) */
export const loadNeighborhoodLocationRowsShared = unstable_cache(
  async (): Promise<{ id: string; city: string | null; name: string | null }[]> => {
    const { data, error } = await getSupabaseServer().from("locations").select("id, city, name");
    if (error || !Array.isArray(data)) throw new Error(error?.message ?? "locations_failed");
    return data as { id: string; city: string | null; name: string | null }[];
  },
  ["neighborhood-location-rows:v1"],
  { revalidate: NEIGHBORHOOD_LOCATIONS_REVALIDATE_SEC, tags: [NEIGHBORHOOD_LOCATIONS_CACHE_TAG] }
);

function expireTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch {
    /* 요청 밖(스크립트·테스트) — 자연 만료 */
  }
}

export function invalidatePhilifeFeedTopicsSharedCache(): void {
  expireTag(PHILIFE_FEED_TOPICS_CACHE_TAG);
}
