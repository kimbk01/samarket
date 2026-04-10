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

/** 채팅 카드·거래 보조 필드용 기본 컬럼 */
const POST_COLUMNS_CHAT_SAFE =
  "id, user_id, title, content, description, price, status, sold_buyer_id, reserved_buyer_id, thumbnail_url, images, region, city, district, meta, view_count, favorite_count, created_at, updated_at, trade_category_id, board_id, service_id, is_free_share, visibility";
const POST_COLUMNS_CHAT_PREFERRED = `${POST_COLUMNS_CHAT_SAFE}, seller_listing_state, author_id`;

export async function fetchPostRowForChat(
  sbAny: SupabaseClient<any>,
  postId: string
): Promise<Record<string, unknown> | null> {
  const pid = typeof postId === "string" ? postId.trim() : "";
  if (!pid) return null;

  let { data, error } = await sbAny
    .from("posts")
    .select(POST_COLUMNS_CHAT_PREFERRED)
    .eq("id", pid)
    .maybeSingle();
  if (error && isMissingSellerListingColumnError(error.message)) {
    const r2 = await sbAny.from("posts").select(POST_COLUMNS_CHAT_SAFE).eq("id", pid).maybeSingle();
    data = (r2.data ?? null) as unknown as typeof data;
    error = r2.error;
  }

  if (!error && data) return data as Record<string, unknown>;

  /**
   * 배포·마이그레이션마다 `posts` 컬럼 집합이 달라, 존재하지 않는 컬럼이 SELECT 에 포함되면
   * PostgREST 가 전체 요청을 거부하고 행이 없는 것처럼 보일 수 있음.
   * 채팅 상단 카드는 `chatProductSummaryFromPostRow(undefined, postId)` 로 떨어져
   * 「글 · UUID…」, ₩0, 썸네일 없음 이 됨 → `*` 로 실제 행을 반드시 가져온다.
   */
  if (error) {
    const rStar = await sbAny.from("posts").select("*").eq("id", pid).maybeSingle();
    if (!rStar.error && rStar.data) return rStar.data as Record<string, unknown>;
  }

  return null;
}

/**
 * `item_id` 가 비어 있거나 잘못됐을 때 `related_post_id` 등으로 posts 를 찾기 — 채팅 상단 카드·목록과 동일 행 필요
 */
export async function fetchPostRowForChatFirstResolved(
  sbAny: SupabaseClient<any>,
  candidatePostIds: readonly string[]
): Promise<Record<string, unknown> | null> {
  const seen = new Set<string>();
  for (const raw of candidatePostIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row = await fetchPostRowForChat(sbAny, id);
    if (row) return row;
  }
  return null;
}

/**
 * chat_rooms.item_id / related_post_id 로 posts 를 못 찾을 때 — 동일 판매자·구매자 `product_chats.post_id` 로 조회
 * (통합 방만 있고 item_id 가 비어 있는 데이터·스키마 불일치 보정)
 */
export async function fetchPostRowForChatViaProductChatsPair(
  sbAny: SupabaseClient<any>,
  sellerId: string | null | undefined,
  buyerId: string | null | undefined,
  skipPostIds: readonly string[]
): Promise<Record<string, unknown> | null> {
  const sid = typeof sellerId === "string" ? sellerId.trim() : "";
  const bid = typeof buyerId === "string" ? buyerId.trim() : "";
  if (!sid || !bid) return null;

  const skip = new Set(skipPostIds.map((x) => String(x).trim()).filter(Boolean));

  const { data: rows, error } = await sbAny
    .from("product_chats")
    .select("post_id")
    .eq("seller_id", sid)
    .eq("buyer_id", bid)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error || !Array.isArray(rows)) return null;

  for (const row of rows) {
    const pid = typeof (row as { post_id?: unknown }).post_id === "string" ? (row as { post_id: string }).post_id.trim() : "";
    if (!pid || skip.has(pid)) continue;
    skip.add(pid);
    const p = await fetchPostRowForChat(sbAny, pid);
    if (p) return p;
  }
  return null;
}

export async function fetchPostRowsForChatIn(
  sbAny: SupabaseClient<any>,
  postIds: string[]
): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return [];

  let { data, error } = await sbAny.from("posts").select(POST_COLUMNS_CHAT_PREFERRED).in("id", ids);
  if (error && isMissingSellerListingColumnError(error.message)) {
    const r2 = await sbAny.from("posts").select(POST_COLUMNS_CHAT_SAFE).in("id", ids);
    data = (r2.data ?? null) as unknown as typeof data;
    error = r2.error;
  }
  if (!error && Array.isArray(data)) return data as Record<string, unknown>[];

  if (error) {
    const rStar = await sbAny.from("posts").select("*").in("id", ids);
    if (!rStar.error && Array.isArray(rStar.data)) return rStar.data as Record<string, unknown>[];
  }

  return [];
}
