import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * owner-edit 전용 posts 단건 SELECT — 컬럼/스키마 차이·posts.type 미존재 DB까지 순차 시도.
 * (명시적 컬럼만 사용 — select('*') 나 캐시상 가상 컬럼 이슈 회피)
 */
const OWNER_EDIT_POST_SELECT_TIERS = [
  "id, user_id, trade_category_id, title, content, price, region, city, images, meta, is_free_share, is_price_offer, status, seller_listing_state, thumbnail_url",
  "id, user_id, trade_category_id, title, content, price, region, city, images, status, seller_listing_state",
  "id, user_id, trade_category_id, title, content, price, region, city, images, status",
] as const;

function isSchemaOrMissingColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /does not exist|unknown column|schema cache|could not find|42703|column .* does not exist/i.test(
      message
    ) || m.includes("posts.type")
  );
}

function normalizeOwnerEditRow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    barangay: raw.barangay ?? null,
    meta: raw.meta ?? null,
    is_free_share: raw.is_free_share === true,
    is_price_offer: raw.is_price_offer === true,
    thumbnail_url: raw.thumbnail_url ?? null,
    seller_listing_state: raw.seller_listing_state,
  };
}

export async function fetchPostRowForOwnerEdit(
  sbAny: SupabaseClient<any>,
  postId: string
): Promise<{ row: Record<string, unknown> | null; errorMessage: string | null }> {
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) return { row: null, errorMessage: "postId 필요" };

  let lastMsg = "";
  for (const sel of OWNER_EDIT_POST_SELECT_TIERS) {
    const { data, error } = await sbAny.from("posts").select(sel).eq("id", id).maybeSingle();
    const raw = data;
    const okRow =
      raw &&
      typeof raw === "object" &&
      !("error" in raw && (raw as { error?: boolean }).error === true)
        ? (raw as Record<string, unknown>)
        : null;

    if (!error && okRow) {
      return { row: normalizeOwnerEditRow(okRow), errorMessage: null };
    }

    const msg =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? error)
        : String(error ?? "");
    lastMsg = msg;
    if (msg && !isSchemaOrMissingColumnError(msg)) {
      return { row: null, errorMessage: msg };
    }
  }

  return { row: null, errorMessage: lastMsg || "글을 불러오지 못했습니다." };
}
