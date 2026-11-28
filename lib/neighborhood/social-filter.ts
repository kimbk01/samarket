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

/**
 * 다른 경로(동네 피드 제외 목록 1회 조회 · 2026-11-25)가 같은 조건으로 읽은 차단 작성자 id 를 같은 캐시에 넣는다
 * → 같은 요청의 상세·댓글 등 후속 `fetchBlockedAuthorIdsForViewer` 가 다시 읽지 않는다(TTL 동일 5초).
 */
export function rememberBlockedAuthorIdsForViewer(viewerId: string, ids: Set<string>): void {
  const v = viewerId.trim();
  if (!v) return;
  blockedIdsCacheByViewer.set(v, { at: Date.now(), ids: new Set(ids) });
}

/** 관심이웃 대상 user_id (필터 시 이 작성자만 노출 + 본인 글 — `includeSelf:false` 면 본인 글 제외) */
export async function fetchNeighborFollowTargetIds(
  sb: SupabaseClient<any>,
  viewerId: string,
  opts?: { includeSelf?: boolean }
): Promise<Set<string>> {
  const v = viewerId.trim();
  if (!v) return new Set();
  const { data } = await sb
    .from("user_relationships")
    .select("target_user_id")
    .eq("user_id", v)
    .eq("type", "neighbor_follow");
  const s = new Set<string>();
  if (Array.isArray(data)) {
    for (const r of data as { target_user_id?: string }[]) {
      if (r.target_user_id) s.add(r.target_user_id);
    }
  }
  if (opts?.includeSelf !== false) s.add(v);
  return s;
}
