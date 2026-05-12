import type { SupabaseClient } from "@supabase/supabase-js";

/** 90일 최근 주문 건수 집계용 — `/api/stores/[slug]` 와 동일 */
export const RECENT_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "refund_requested",
] as const;

/** Legacy `GET /api/stores/:slug` 의 `stores` select */
export const STORE_SELECT_LEGACY_DETAIL =
  "id, store_name, slug, business_type, description, phone, region, city, district, address_line1, address_line2, lat, lng, business_hours_json, profile_image_url, gallery_images_json, is_open, delivery_available, pickup_available, visit_available, reservation_available, rating_avg, review_count, approval_status, is_visible, created_at, updated_at";

/** `GET /api/stores/:slug/summary` — 메뉴 없이 상단·배달 메타용 */
export const STORE_SELECT_SUMMARY =
  "id, store_name, slug, business_type, description, phone, region, city, district, address_line1, address_line2, lat, lng, business_hours_json, profile_image_url, gallery_images_json, is_open, delivery_available, pickup_available, visit_available, reservation_available, rating_avg, review_count, approval_status, is_visible, created_at, updated_at";

/** `/menus`·`reviews-summary` 등 store id 만 필요할 때 */
export const STORE_SELECT_ID_SLUG_GATE = "id, slug, approval_status, is_visible";

/** `GET /api/stores/[slug]/delivery-eta` — 승인·가시 gate + 배달 ETA 에 필요한 컬럼만 */
export const STORE_DELIVERY_ETA_SELECT =
  "id, slug, lat, lng, delivery_available, business_hours_json, approval_status, is_visible";

export type ApprovedStoreLookupResult =
  | { ok: true; store: Record<string, unknown> }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; message: string };

/**
 * 승인·공개 매장만 slug 로 조회. `approval_status` / `is_visible` 은 select 에 포함되어 있어야 함.
 */
export async function getApprovedStoreBySlug(
  sb: SupabaseClient,
  decodedSlug: string,
  selectColumns: string
): Promise<ApprovedStoreLookupResult> {
  const { data: store, error: storeErr } = await sb
    .from("stores")
    .select(selectColumns)
    .eq("slug", decodedSlug)
    .maybeSingle();

  if (storeErr) {
    return { ok: false, reason: "db_error", message: storeErr.message };
  }

  const row = store as Record<string, unknown> | null;
  if (!row || row.approval_status !== "approved" || row.is_visible !== true) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, store: row };
}

export type StoreCommerceMeta = {
  favoriteCount: number;
  recentOrderCount: number;
  viewerFavorited: boolean;
  canSell: boolean;
};

/**
 * 찜 수·최근 주문 수·뷰어 찜·판매 가능 — 기존 `/api/stores/[slug]` 와 동일 산식.
 */
export async function loadStoreCommerceMeta(
  sb: SupabaseClient,
  storeId: string,
  viewerUserId: string | null
): Promise<StoreCommerceMeta> {
  const since90d = new Date();
  since90d.setUTCDate(since90d.getUTCDate() - 90);

  let favoriteCount = 0;
  let recentOrderCount = 0;
  let viewerFavorited = false;

  try {
    const [favRes, ordRes] = await Promise.all([
      sb.from("store_favorites").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .in("order_status", [...RECENT_ORDER_STATUSES])
        .gte("created_at", since90d.toISOString()),
    ]);
    if (favRes.error) console.error("[store-meta] favorite count", favRes.error);
    else if (typeof favRes.count === "number") favoriteCount = favRes.count;
    if (ordRes.error) console.error("[store-meta] recent orders count", ordRes.error);
    else if (typeof ordRes.count === "number") recentOrderCount = ordRes.count;
  } catch (e) {
    console.error("[store-meta] aggregate counts", e);
  }

  if (viewerUserId) {
    try {
      const { data: favRow, error: vfErr } = await sb
        .from("store_favorites")
        .select("id")
        .eq("store_id", storeId)
        .eq("user_id", viewerUserId)
        .maybeSingle();
      if (vfErr) console.error("[store-meta] viewer favorited", vfErr);
      else viewerFavorited = !!favRow;
    } catch (e) {
      console.error("[store-meta] viewer favorited", e);
    }
  }

  const { data: perm } = await sb
    .from("store_sales_permissions")
    .select("allowed_to_sell, sales_status")
    .eq("store_id", storeId)
    .maybeSingle();

  const canSell = !!perm && perm.allowed_to_sell === true && perm.sales_status === "approved";

  return { favoriteCount, recentOrderCount, viewerFavorited, canSell };
}
