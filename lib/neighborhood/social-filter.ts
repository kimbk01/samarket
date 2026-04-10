import type { SupabaseClient } from "@supabase/supabase-js";

/** 글 상세+댓글 등 동일 요청에서 4회 쿼리 중복을 막기 위한 프로세스 로컬 캐시 */
const BLOCKED_IDS_CACHE_TTL_MS = 5000;
const blockedIdsCacheByViewer = new Map<string, { at: number; ids: Set<string> }>();

/**
 * 피드/상세에서 제외할 작성자 ID (내가 차단 + 나를 차단 + 관계 테이블 blocked)
 */
export async function fetchBlockedAuthorIdsForViewer(
  sb: SupabaseClient<any>,
  viewerId: string
): Promise<Set<string>> {
  const out = new Set<string>();
  const v = viewerId.trim();
  if (!v) return out;

  const now = Date.now();
  const hit = blockedIdsCacheByViewer.get(v);
  if (hit && now - hit.at < BLOCKED_IDS_CACHE_TTL_MS) {
    return new Set(hit.ids);
  }

  const [{ data: outBlocks }, { data: inBlocks }, { data: relOut }, { data: relIn }] = await Promise.all([
    sb.from("user_blocks").select("blocked_user_id").eq("user_id", v),
    sb.from("user_blocks").select("user_id").eq("blocked_user_id", v),
    sb.from("user_relationships").select("target_user_id").eq("user_id", v).or("relation_type.eq.blocked,type.eq.blocked"),
    sb.from("user_relationships").select("user_id").eq("target_user_id", v).or("relation_type.eq.blocked,type.eq.blocked"),
  ]);

  const addRows = (rows: unknown, key: string) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows as Record<string, unknown>[]) {
      const id = r[key];
      if (typeof id === "string" && id) out.add(id);
    }
  };

  addRows(outBlocks, "blocked_user_id");
  addRows(inBlocks, "user_id");
  addRows(relOut, "target_user_id");
  addRows(relIn, "user_id");
  blockedIdsCacheByViewer.set(v, { at: now, ids: out });
  return out;
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
