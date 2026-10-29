import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { isSampleStoreKind } from "@/lib/stores/store-public-menu-open";
import { loadStoreRecentOrderCount90dCached } from "@/lib/stores/store-recent-order-count-cache";
import { isStoreDetailViewerBlocked, storeDetailLoginRequiredResponse } from "@/lib/stores/store-detail-api-gate";
import {
  loadStoreProductPublicRow,
  loadStoreProductPublicStore,
} from "@/lib/stores/store-product-public-detail-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
   * 상품·매장 노출 판정은 공용 서버 로더(`store-product-public-detail-loader`) — 상품 페이지 메타와 같은 정의.
   *
   * v4 재감사 API-14 — 매장 상세 계열 게이트(로그인만, 다른 상세 API 와 같은 401 `login_required`).
   * 공유 메타는 이 API 가 아니라 서버 로더를 직접 쓰므로 비로그인 크롤러도 제목·이미지를 받는다.
   */
  const [viewerId, prod] = await Promise.all([getRouteUserId(), loadStoreProductPublicRow(sb, id)]);
  if (isStoreDetailViewerBlocked(viewerId)) {
    return storeDetailLoginRequiredResponse({ product: null, store: null });
  }
  if (!prod) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const storeId = String(prod.store_id ?? "");
  const [store, favRes, recentOrderCount] = await Promise.all([
    loadStoreProductPublicStore(sb, storeId),
    loadStoreFavoriteCountSafe(sb, storeId),
    loadStoreRecentOrderCount90dCached(sb, storeId).catch((err: unknown) => {
      // 집계 실패는 0 으로 표시(기존 동작) — 원인은 서버 로그로 남긴다.
      console.error(
        "[api/stores/products/[productId]] recent_order_count",
        storeId,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }),
  ]);

  if (!store) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

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
