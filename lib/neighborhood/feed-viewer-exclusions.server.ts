import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 동네 피드 로그인 사용자 제외 목록 1회 조회 — DB 함수 `neighborhood_feed_viewer_exclusions` (2026-11-25 · S4).
 * 예전: 차단 관계(`user_social_relations`)와 숨긴 글(`community_post_hides`)을 요청마다 따로 읽었다.
 * 조건은 기존과 같다(마이그레이션 주석·계약 시험). 판정·필터는 호출자(listNeighborhoodFeed) 그대로.
 *
 * 반환 null = 이 경로로 판단 못 함(함수 없음·오류·형식 이상) → 호출자는 기존 두 조회를 그대로 쓴다.
 */
export const NEIGHBORHOOD_FEED_VIEWER_EXCLUSIONS_RPC = "neighborhood_feed_viewer_exclusions";

export type FeedViewerExclusions = { blockedAuthorIds: Set<string>; hiddenPostIds: Set<string> };

function idSet(raw: unknown): Set<string> | null {
  if (!Array.isArray(raw)) return null;
  const out = new Set<string>();
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) out.add(s);
  }
  return out;
}

export async function loadFeedViewerExclusions(
  sb: SupabaseClient<any>,
  viewerId: string
): Promise<FeedViewerExclusions | null> {
  const v = viewerId.trim();
  if (!v) return null;
  try {
    const { data, error } = await sb.rpc(NEIGHBORHOOD_FEED_VIEWER_EXCLUSIONS_RPC, { p_viewer: v });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const row = data as { blocked_user_ids?: unknown; hidden_post_ids?: unknown };
    const blocked = idSet(row.blocked_user_ids);
    const hidden = idSet(row.hidden_post_ids);
    if (!blocked || !hidden) return null;
    return { blockedAuthorIds: blocked, hiddenPostIds: hidden };
  } catch {
    return null;
  }
}
