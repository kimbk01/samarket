import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  COMMUNITY_FEED_TOP_SELECT_TAIL,
  communityFeedTopCandidatesOrFilter,
} from "@/lib/community-feed/community-feed-top-posts";

/**
 * 동네 피드 상단 후보(공지·관리자 고정) — 서버 공유 캐시 (2026-11-19).
 *
 * 운영 실측: `/api/philife/neighborhood-feed` 1요청당 `community_posts` 2.0회 — 메인 목록 1 + 상단 후보 1.
 * 상단 후보는 **모든 사용자·모든 동네에 같은 조회**(동네·보는 사람 조건 없음, 최대 60행)인데 요청마다 읽었다.
 * → Next Data Cache(인스턴스 공유) 60초 + 관리자 공지·고정 저장 시 태그 즉시 만료.
 *
 * 정확성: 노출 여부(고정 기간·공지 기간)는 조회 뒤 `isCommunityPinActive`·`isCommunityNoticeLive` 가 **현재 시각**으로
 * 다시 거른다 → 캐시 안에서 기간이 끝난 글도 지금처럼 빠진다. 바뀌는 것: 상단 글의 조회수·좋아요 수 표시가 최대 60초 늦을 수 있고,
 * 작성자가 고정 글을 직접 지우면 최대 60초 남을 수 있다(관리자 변경은 즉시 반영).
 * 읽기 실패는 캐시하지 않는다(throw → 호출부가 상단 없이 목록 그대로, 기존 동작).
 */
export const COMMUNITY_FEED_TOP_CANDIDATES_CACHE_TAG = "community-feed-top-candidates";
export const COMMUNITY_FEED_TOP_CANDIDATES_REVALIDATE_SEC = 60;

const loadTopCandidatesCached = unstable_cache(
  async (selectCols: string, activeStatus: string): Promise<Record<string, unknown>[]> => {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_posts")
      .select(selectCols + COMMUNITY_FEED_TOP_SELECT_TAIL)
      .eq("status", activeStatus)
      .or(communityFeedTopCandidatesOrFilter(new Date().toISOString()))
      .limit(60);
    if (error || !Array.isArray(data)) throw new Error(error?.message ?? "top_candidates_unavailable");
    return data as unknown as Record<string, unknown>[];
  },
  ["community-feed-top-candidates:v1"],
  { revalidate: COMMUNITY_FEED_TOP_CANDIDATES_REVALIDATE_SEC, tags: [COMMUNITY_FEED_TOP_CANDIDATES_CACHE_TAG] }
);

export async function loadCommunityFeedTopCandidatesShared(
  selectCols: string,
  activeStatus: string
): Promise<Record<string, unknown>[]> {
  try {
    return await loadTopCandidatesCached(selectCols, activeStatus);
  } catch {
    return [];
  }
}

/** 관리자 공지·고정·글 상태 변경 뒤 — 모든 인스턴스의 상단 후보 캐시 즉시 만료 */
export function invalidateCommunityFeedTopCandidatesCache(): void {
  try {
    revalidateTag(COMMUNITY_FEED_TOP_CANDIDATES_CACHE_TAG, { expire: 0 });
  } catch {
    /* 요청 밖(스크립트·테스트) — 60초 뒤 자연 만료 */
  }
}
