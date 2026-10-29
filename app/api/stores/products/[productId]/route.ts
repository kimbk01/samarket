import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import { isSampleStoreKind, loadStorePublicMenuOpen } from "@/lib/stores/store-public-menu-open";
import { loadStoreRecentOrderCount90dCached } from "@/lib/stores/store-recent-order-count-cache";
import { stripStoreProductPublicInternalFields } from "@/lib/stores/store-product-public-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PostgREST 임베드 포함 시 클라이언트 제네릭이 깨져 `store_id` 등 접근에 캐스트 필요 */
type StoreProductPublicRow = { store_id: string } & Record<string, unknown>;

/** 찜 수 — 집계 오류는 0 (기존 동작) */
async function loadStoreFavoriteCountSafe(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>,
  storeId: string
): Promise<number> {
  try {
    const res = await sb
      .from("store_favorites")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    return !res.error && typeof res.count === "number" ? res.count : 0;
  } catch {
    return 0;
  }
}

/** 공개 매장 상품 단건 (active + 매장·판매 조건 충족) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const { productId } = await context.params;
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  /**
   * v4 PERF-09 — 독립 단계 병렬 (기존 6단 직렬 → 3단):
   *   1) 상품 + 인증(쿠키) 동시
   *   2) 매장 행·메뉴 공개 RPC·찜 수·90일 주문 수(메모리 캐시) — 모두 `product.store_id` 만 필요 → 동시
   *   3) 주문 가능 판정 (뷰어=사장님일 때만 DB)
   * 판정 순서·응답 형태는 동일 (상품 404 → 매장 404 → 메뉴 비공개 404).
   */
  const viewerIdP = getRouteUserId();
  const { data: product, error: pErr } = await sb
    .from("store_products")
    .select(
      [
        "id, store_id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory",
        "min_order_qty, max_order_qty, thumbnail_url, images_json, options_json, product_status",
        "pickup_available, local_delivery_available, shipping_available",
        "category_id, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, created_at",
        "admin_review_status",
        "store_menu_sections ( id, name, sort_order, is_hidden )",
        "store_product_categories ( name, slug )",
      ].join(", ")
    )
    .eq("id", id)
    .in("product_status", ["active", "sold_out"])
    .maybeSingle();

  if (pErr || !product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const prod = product as unknown as StoreProductPublicRow;
  // PRD-03 · PRD-05 — 노출 = 주문 가능: 검수 반려·재검수 대기, 숨김 구역 상품은 메뉴판과 같이 404.
  if (storeProductBuyerVisibilityBlocked(prod)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  stripStoreProductPublicInternalFields(prod);

  const storeId = String(prod.store_id ?? "");
  const [storeRes, menuOpen, favRes, recentOrderCount] = await Promise.all([
    sb
      .from("stores")
      .select(
        "id, owner_user_id, slug, store_name, approval_status, is_visible, phone, region, city, district, is_open, business_hours_json, profile_image_url, delivery_available, pickup_available, rating_avg, review_count, store_kind"
      )
      .eq("id", storeId)
      .maybeSingle(),
    /**
     * S-01 — 상품 노출 = 메뉴 공개(DB `store_public_menu_open`: 판매 승인 OR 샘플).
     * 판매 미승인 실매장은 지금처럼 404. 판매 가능(canSell)은 주문 게이트(`store_not_selling`)에서만 판정.
     */
    loadStorePublicMenuOpen(sb, storeId),
    loadStoreFavoriteCountSafe(sb, storeId),
    loadStoreRecentOrderCount90dCached(sb, storeId).catch(() => null),
  ]);
  const { data: store, error: sErr } = storeRes;

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!menuOpen) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const viewerId = await viewerIdP;
  const orderability = await resolveStoreOrderability(sb, viewerId, store.owner_user_id);

  const favorite_count = favRes;
  const recent_order_count = typeof recentOrderCount === "number" ? recentOrderCount : 0;

  return NextResponse.json({
    ok: true,
    product: prod,
    store: {
      id: store.id,
      slug: store.slug,
      store_name: store.store_name,
      phone: store.phone,
      region: store.region,
      city: store.city,
      district: store.district,
      is_open: store.is_open,
      business_hours_json: store.business_hours_json,
      profile_image_url: store.profile_image_url,
      delivery_available: store.delivery_available,
      pickup_available: store.pickup_available,
      rating_avg: store.rating_avg ?? null,
      review_count: store.review_count ?? null,
      /** v4 PL-02 — 샘플 매장(실제 주문 불가) 배지. 원문 `store_kind` 는 싣지 않는다 */
      isSampleStore: isSampleStoreKind((store as { store_kind?: unknown }).store_kind),
      favorite_count,
      recent_order_count,
      viewer_is_owner: orderability.viewer_is_owner,
      viewer_is_admin: orderability.viewer_is_admin,
      can_order_store: orderability.can_order_store,
      owner_block_message: orderability.owner_block_message,
    },
  });
}
