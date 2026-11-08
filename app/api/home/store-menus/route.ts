import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";
import { normalizeBrowseFeaturedDiscountPrice } from "@/lib/stores/browse-card-menu-strip";
import { loadHomeLayoutServerCached } from "@/lib/home/load-home-layout-server";
import { HOME_STORE_SHOW_MAX } from "@/lib/home/home-layout-contract";

/** 메뉴 0개 매장을 빼고도 보일 수를 채우도록 보일 수 + 3 매장까지 받는다 */
const STORE_IDS_MAX = HOME_STORE_SHOW_MAX + 3;
import type { HomeStoreMenuItem } from "@/lib/home/home-catalog-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장당 후보 메뉴 수 — 홈은 이 안에서 새로고침마다 돌아가며 3~6개를 보인다 */
const MENU_POOL_PER_STORE = 12;

/**
 * 홈 「지금 주문할 수 있는 매장」 메뉴 (회원만 — 배달 열람 규정 S-07).
 * 매장 목록·순서·배달 판정은 배달 탭과 같은 `GET /api/stores/home-feed` 결과를 화면이 그대로 쓰고,
 * 여기서는 그 매장들의 메뉴만 준다. 메뉴 노출 규칙은 배달 홈 피드와 같다:
 * 판매 중(`product_status=active`) · 검수 반려/대기·숨긴 메뉴 구역 제외(`storeProductBuyerVisibilityBlocked`) · 사진 있는 메뉴.
 * 어드민이 매장별로 「직접 고르기」한 메뉴가 있으면 그 순서가 앞에 온다.
 */
export async function GET(req: Request) {
  if (!(await getRouteUserId())) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: true, menus: {} });

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, STORE_IDS_MAX);
  if (ids.length === 0) return NextResponse.json({ ok: true, menus: {} });

  const [{ config }, { data, error }] = await Promise.all([
    loadHomeLayoutServerCached(),
    sb
      .from("store_products")
      .select(
        "id, store_id, title, price, discount_price, thumbnail_url, is_featured, is_owner_recommended, sort_order, admin_review_status, store_menu_sections ( is_hidden )"
      )
      .in("store_id", ids)
      .eq("product_status", "active")
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(ids.length * 60),
  ]);
  if (error) {
    console.error("[api/home/store-menus]", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const manualByStore = new Map<string, string[]>();
  if (config.stores.mode === "manual") {
    for (const p of config.stores.picks) {
      if (p.menuMode === "manual" && p.productIds.length > 0) manualByStore.set(p.storeId, p.productIds);
    }
  }

  type Row = {
    id: string;
    store_id: string;
    title: string;
    price: number | string;
    discount_price: number | string | null;
    thumbnail_url: string | null;
    is_featured: boolean | null;
    is_owner_recommended: boolean | null;
    sort_order: number | null;
  };
  const byStore = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) {
    if (storeProductBuyerVisibilityBlocked(r as unknown as Record<string, unknown>)) continue;
    if (!resolveBrowseFeaturedMenuImageUrl(r.thumbnail_url)) continue;
    const arr = byStore.get(r.store_id) ?? [];
    arr.push(r);
    byStore.set(r.store_id, arr);
  }

  const menus: Record<string, HomeStoreMenuItem[]> = {};
  for (const id of ids) {
    const rows = byStore.get(id) ?? [];
    // 대표(is_featured) → 사장님 추천 → 정렬 순서
    const ranked = [...rows].sort((a, b) => {
      const f = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (f !== 0) return f;
      const r = Number(!!b.is_owner_recommended) - Number(!!a.is_owner_recommended);
      if (r !== 0) return r;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    const manual = manualByStore.get(id);
    const ordered = manual
      ? [
          ...manual.map((pid) => ranked.find((r) => r.id === pid)).filter((r): r is Row => Boolean(r)),
          ...ranked.filter((r) => !manual.includes(r.id)),
        ]
      : ranked;
    // 직접 고른 메뉴만 쓰는 매장은 고른 메뉴만 (판매 중인 것만)
    const finalRows = manual ? ordered.filter((r) => manual.includes(r.id)) : ordered;
    menus[id] = finalRows.slice(0, MENU_POOL_PER_STORE).map((r) => ({
      id: String(r.id),
      title: r.title,
      price: Number(r.price),
      discountPrice: normalizeBrowseFeaturedDiscountPrice(r.price, r.discount_price),
      imageUrl: resolveBrowseFeaturedMenuImageUrl(r.thumbnail_url),
    }));
  }
  return NextResponse.json({ ok: true, menus }, { headers: { "Cache-Control": "private, no-store" } });
}
