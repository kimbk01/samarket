import type { SupabaseClient } from "@supabase/supabase-js";
import { pruneByAtMaxAgeAndMaxSize } from "@/lib/http/memory-map-prune";
import {
  fetchBlockedAuthorIdsForViewerSb,
  filterCommentRowsExcludingBlockedRelations,
} from "@/lib/social/user-block-ssot";

export { filterCommentRowsExcludingBlockedRelations };

/** 글 상세+댓글 등 동일 요청에서 쿼리 중복을 막기 위한 프로세스 로컬 캐시 */
const BLOCKED_IDS_CACHE_TTL_MS = 5000;
const BLOCKED_IDS_CACHE_MAX_AGE_MS = 120_000;
const BLOCKED_IDS_CACHE_MAX_VIEWER_KEYS = 500;
const blockedIdsCacheByViewer = new Map<string, { at: number; ids: Set<string> }>();

/**
 * 피드/상세에서 제외할 작성자 ID (양방향 차단)
 * SSOT `user_social_relations` + legacy fallback — `lib/social/user-block-ssot.ts`
 */
export async function fetchBlockedAuthorIdsForViewer(
  sb: SupabaseClient<any>,
  viewerId: string,
  metrics?: { supabaseSelectCalls: number }
): Promise<Set<string>> {
  const v = viewerId.trim();
  if (!v) return new Set();

  const now = Date.now();
  pruneByAtMaxAgeAndMaxSize(blockedIdsCacheByViewer, now, BLOCKED_IDS_CACHE_MAX_AGE_MS, BLOCKED_IDS_CACHE_MAX_VIEWER_KEYS);
  const hit = blockedIdsCacheByViewer.get(v);
  if (hit && now - hit.at < BLOCKED_IDS_CACHE_TTL_MS) {
    return new Set(hit.ids);
  }

  const ids = await fetchBlockedAuthorIdsForViewerSb(sb, v, metrics);
  blockedIdsCacheByViewer.set(v, { at: now, ids });
  return ids;
}

/** 관심이웃 대상 user_id (필터 시 이 작성자만 노출 + 본인 글) */
export async function fetchNeighborFollowTargetIds(
  sb: SupabaseClient<any>,
  viewerId: string
): Promise<Set<string>> {
  const v = viewerId.trim();
  if (!v) return new Set();
  const { data } = await sb
    .from("user_relationships")
    .select("target_user_id")
    .eq("user_id", v)
    .or("relation_type.eq.neighbor_follow,type.eq.neighbor_follow");
  const s = new Set<string>();
  if (Array.isArray(data)) {
    for (const r of data as { target_user_id?: string }[]) {
      if (r.target_user_id) s.add(r.target_user_id);
    }
  }
  s.add(v);
  return s;
}
