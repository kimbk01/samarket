/**
 * posts 조회 — Supabase에 seller_listing_state 미적용·스키마 캐시 불일치 시에도 채팅이 동작하도록 폴백.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingSellerListingColumnError(message: string | undefined | null): boolean {
  const m = String(message ?? "");
  return (
    /seller_listing_state/i.test(m) &&
    /does not exist|unknown column|schema cache|Could not find/i.test(m)
  );
}

/** select('*') 실패 시 재시도용 — 채팅 카드·거래 보조 필드 */
const POST_COLUMNS_CHAT_SAFE =
  "id, user_id, title, content, description, price, status, sold_buyer_id, reserved_buyer_id, thumbnail_url, images, region, city, district, meta, view_count, favorite_count, created_at, updated_at, trade_category_id, category_id, board_id, service_id, is_free_share, visibility";

export async function fetchPostRowForChat(
  sbAny: SupabaseClient<any>,
  postId: string
): Promise<Record<string, unknown> | null> {
  const pid = typeof postId === "string" ? postId.trim() : "";
  if (!pid) return null;

  let { data, error } = await sbAny.from("posts").select("*").eq("id", pid).maybeSingle();
  if (error && isMissingSellerListingColumnError(error.message)) {
    const r2 = await sbAny.from("posts").select(POST_COLUMNS_CHAT_SAFE).eq("id", pid).maybeSingle();
    data = r2.data;
    error = r2.error;
  }
  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

export async function fetchPostRowsForChatIn(
  sbAny: SupabaseClient<any>,
  postIds: string[]
): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return [];

  let { data, error } = await sbAny.from("posts").select("*").in("id", ids);
  if (error && isMissingSellerListingColumnError(error.message)) {
    const r2 = await sbAny.from("posts").select(POST_COLUMNS_CHAT_SAFE).in("id", ids);
    data = r2.data;
    error = r2.error;
  }
  if (error || !Array.isArray(data)) return [];
  return data as Record<string, unknown>[];
}
