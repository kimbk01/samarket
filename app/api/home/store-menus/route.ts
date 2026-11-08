import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";
import { normalizeBrowseFeaturedDiscountPrice } from "@/lib/stores/browse-card-menu-strip";
import { loadHomeLayoutServerCached } from "@/lib/home/load-home-layout-server";
import { HOME_STORE_SHOW_MAX } from "@/lib/home/home-layout-contract";
import { HOME_STORE_MENU_SELECT, isHomeStoreMenuVisible } from "@/lib/home/home-store-menu-visibility";
import type { HomeStoreMenuItem } from "@/lib/home/home-catalog-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 메뉴 0개 매장을 빼고도 보일 수를 채우도록 보일 수 + 3 매장까지 받는다 */
const STORE_IDS_MAX = HOME_STORE_SHOW_MAX + 3;
/** 매장당 후보 메뉴 수 — 홈은 이 안에서 새로고침마다 돌아가며 3~6개를 보인다 */
const MENU_POOL_PER_STORE = 12;
/** 매장당 조회 상한(정렬 앞쪽) — 직접 고른 메뉴는 따로 id 로 조회해 이 상한에 잘리지 않는다 */
const MENU_FETCH_PER_STORE = 40;

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
  admin_review_status?: unknown;
  store_menu_sections?: unknown;
};

/**
 * 홈 「우리 동네 배달 매장」 메뉴 (회원만 — 배달 열람 규정 S-07).
 * 매장 목록·순서·배달 판정은 배달 탭과 같은 `GET /api/stores/home-feed` 결과를 화면이 그대로 쓰고,
 * 여기서는 그 매장들의 메뉴만 준다.
 * - 매장: 승인·공개 매장만 (숨김·미승인 매장 메뉴는 주지 않음 — 감사 2026-11-09)
 * - 메뉴: `isHomeStoreMenuVisible` (판매 중 · 검수/숨긴 구역 아님 · 사진 있음) — 어드민 메뉴 수와 같은 판정
 * - 어드민이 매장별로 「직접 고르기」한 메뉴는 그 순서로 (id 로 따로 조회)
 */
export async function GET(req: Request) {
  if (!(await getRouteUserId())) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const requested = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, STORE_IDS_MAX);
  if (requested.length === 0) return NextResponse.json({ ok: true, menus: {} });

  const [{ config }, storesRes] = await Promise.all([
    loadHomeLayoutServerCached(),
    sb.from("stores").select("id").in("id", requested).eq("approval_status", "approved").eq("is_visible", true),
  ]);
  if (storesRes.error) {
    console.error("[api/home/store-menus] stores", storesRes.error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const allowed = new Set(((storesRes.data ?? []) as { id: string }[]).map((r) => String(r.id)));
  const ids = requested.filter((id) => allowed.has(id));
  if (ids.length === 0) return NextResponse.json({ ok: true, menus: {} });

  const manualByStore = new Map<string, string[]>();
  if (config.stores.mode === "manual") {
    for (const p of config.stores.picks) {
      if (allowed.has(p.storeId) && p.menuMode === "manual" && p.productIds.length > 0) {
        manualByStore.set(p.storeId, p.productIds);
      }
    }
  }
  const manualIds = [...manualByStore.values()].flat();

  const [rankedRes, manualRes] = await Promise.all([
    sb
      .from("store_products")
      .select(HOME_STORE_MENU_SELECT)
      .in("store_id", ids)
      .eq("product_status", "active")
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(ids.length * MENU_FETCH_PER_STORE),
    manualIds.length > 0
      ? sb.from("store_products").select(HOME_STORE_MENU_SELECT).in("id", manualIds).eq("product_status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rankedRes.error || manualRes.error) {
    console.error("[api/home/store-menus]", (rankedRes.error ?? manualRes.error)?.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const byStore = new Map<string, Row[]>();
  for (const r of (rankedRes.data ?? []) as Row[]) {
    if (!isHomeStoreMenuVisible(r)) continue;
    const arr = byStore.get(r.store_id) ?? [];
    arr.push(r);
    byStore.set(r.store_id, arr);
  }
  const manualRows = new Map<string, Row>();
  for (const r of (manualRes.data ?? []) as Row[]) {
    if (isHomeStoreMenuVisible(r) && allowed.has(r.store_id)) manualRows.set(String(r.id), r);
  }

  const menus: Record<string, HomeStoreMenuItem[]> = {};
  for (const id of ids) {
    const manual = manualByStore.get(id);
    let rows: Row[];
    if (manual) {
      // 직접 고른 메뉴만, 고른 순서대로 (판매 중·사진 있는 것만)
      rows = manual.map((pid) => manualRows.get(pid)).filter((r): r is Row => Boolean(r) && r!.store_id === id);
    } else {
      // 대표(is_featured) → 사장님 추천 → 정렬 순서
      rows = [...(byStore.get(id) ?? [])].sort((a, b) => {
        const f = Number(!!b.is_featured) - Number(!!a.is_featured);
        if (f !== 0) return f;
        const rec = Number(!!b.is_owner_recommended) - Number(!!a.is_owner_recommended);
        if (rec !== 0) return rec;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
    }
    menus[id] = rows.slice(0, MENU_POOL_PER_STORE).map((r) => ({
      id: String(r.id),
      title: r.title,
      price: Number(r.price),
      discountPrice: normalizeBrowseFeaturedDiscountPrice(r.price, r.discount_price),
      imageUrl: resolveBrowseFeaturedMenuImageUrl(r.thumbnail_url),
    }));
  }
  return NextResponse.json({ ok: true, menus }, { headers: { "Cache-Control": "private, no-store" } });
}
