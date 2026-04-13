/**
 * 거래 채팅 시작 API — `/api/posts/[id]/detail` 과 **동일한** 단건 로드.
 * - `loadPostRowForDetail`: DETAIL_SELECT 실패 시 `*` 폴백 (컬럼 누락·스키마 차이 흡수)
 * - 읽기 뷰(`posts_masked` 등)에 없으면 기본 `posts` 테이블 재시도
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { loadPostRowForDetail } from "@/lib/posts/map-post-detail-row";

export async function fetchPostRowForTradeChatById(
  sb: SupabaseClient,
  id: string
): Promise<Record<string, unknown> | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const fromRead = await loadPostRowForDetail(sb, POSTS_TABLE_READ, trimmed);
  if (fromRead) return fromRead;

  if (POSTS_TABLE_READ !== "posts") {
    return loadPostRowForDetail(sb, "posts", trimmed);
  }

  return null;
}
