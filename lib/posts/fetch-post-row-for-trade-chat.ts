/**
 * 거래 채팅 시작 API — `/api/posts/[id]/detail` 과 **동일한** 단건 로드.
 * - `loadPostRowForDetail`: DETAIL_SELECT 실패 시 `*` 폴백 (컬럼 누락·스키마 차이 흡수)
 * - 읽기 뷰(`posts_masked` 등)에 없으면 기본 `posts` 테이블 재시도
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { loadPostRowForDetail } from "@/lib/posts/map-post-detail-row";

/** `posts.id` / `price_offers.product_id` 가 텍스트로 저장된 환경에서 대소문자만 다른 경우 단건 조회 실패 방지 */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `posts.id` / `price_offers.product_id` 단건 조회 — UUID 대소문자 변형까지 시도 */
export function uuidLookupCandidates(primary: string): string[] {
  const t = primary.trim();
  if (!t) return [];
  if (!UUID_SHAPE.test(t)) return [t];
  const lower = t.toLowerCase();
  return lower === t ? [t] : [t, lower];
}

export async function fetchPostRowForTradeChatById(
  sb: SupabaseClient,
  id: string
): Promise<Record<string, unknown> | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  for (const key of uuidLookupCandidates(trimmed)) {
    const fromRead = await loadPostRowForDetail(sb, POSTS_TABLE_READ, key);
    if (fromRead) return fromRead;

    if (POSTS_TABLE_READ !== "posts") {
      const fromPosts = await loadPostRowForDetail(sb, "posts", key);
      if (fromPosts) return fromPosts;
    }
  }

  return null;
}
