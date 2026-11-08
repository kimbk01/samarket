import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { loadHomeDiscoveryCandidateRows } from "@/lib/stores/store-discovery-candidate";
import {
  loadOwnerDefaultAddressByUserId,
  resolveEffectiveStoreRouteAddress,
} from "@/lib/stores/store-list-delivery-origin";
import { loadStoreServiceAreaRuntimeMap } from "@/lib/delivery/service-area/load-store-service-area-runtime-map";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import { resolveListDistanceOutOfRange } from "@/lib/delivery/delivery-list-oor-policy";
import { resolveStoreDiscoveryHomeDisplayStatus } from "@/lib/stores/store-discovery-eligibility";
import { loadStoreCompletedOrderCount30dMapWithStatus } from "@/lib/stores/store-discovery-popular-store";
import {
  getPlatformPhLguCentroid,
  getPlatformPhLguDisplayNameById,
  resolvePlatformPhLguFromAddressFields,
  searchPlatformPhLgu,
} from "@/lib/geo/ph-lgu/platform-ph-lgu";
import { isHomeStoreMenuVisible } from "@/lib/home/home-store-menu-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminHomeStorePreviewCity = { id: string; name: string };

export type AdminHomeStorePreviewRow = {
  id: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
  /** 배달 탭과 같은 표시 상태 (영업시간 기준) */
  status: "open" | "preparing" | "closed";
  isSample: boolean;
  distanceKm: number | null;
  /** 홈에 보일 수 있는 메뉴 수 (`isHomeStoreMenuVisible`) */
  visibleMenuCount: number;
  completedOrderCount30d: number;
  firstListedAt: string | null;
};

type Row = Record<string, unknown> & {
  id: string;
  owner_user_id?: string | null;
  store_name?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  delivery_radius_km?: number | null;
  delivery_available?: boolean | null;
  is_open?: boolean | null;
  business_hours_json?: unknown;
  point_commerce_blocked?: boolean | null;
  sales_allowed?: boolean | null;
  is_sample_store?: boolean;
  first_listed_at?: string | null;
  store_categories?: { slug?: string; name?: string } | null;
};

/**
 * 어드민 「홈 구성 › 추천 매장·메뉴 › 주소별 미리보기」 (Owner 「계획대로 수정」 2026-11-09, 계획 7번).
 * GET ?lguId=<도시 LGU id> — 그 도시를 대표 배달 주소로 둔 회원에게 홈 매장 칸 후보가 되는 매장.
 *  - 후보 = 배달 탭 홈 피드와 같은 후보(`loadHomeDiscoveryCandidateRows`: 승인·공개) 중 배달 켬
 *  - 배달 지역 = 배달 탭과 같은 판정(`evaluateStoreDeliveryServiceability`) · 회원 좌표 = 도시 중심점, 회원 LGU = lguId
 *  - 상태 = 배달 탭과 같은 표시 상태(`resolveStoreDiscoveryHomeDisplayStatus`)
 *  - 정렬 = 영업 중 먼저 → 가까운 거리 (배달 탭의 같은 동네·주문 수 보정은 넣지 않은 근사)
 * GET ?q=검색어 — 도시 찾기. 둘 다 없으면 운영 매장이 있는 도시 목록.
 * 조회 = 관리자 전원 (홈 구성 조회와 같음).
 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const lguId = (sp.get("lguId") ?? "").trim().slice(0, 80);
  const q = (sp.get("q") ?? "").trim().slice(0, 40);

  const candidateLoad = await loadHomeDiscoveryCandidateRows(sb);
  if (candidateLoad.status === "error") {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  const rows = (candidateLoad.rows as Row[]).filter((r) => r.delivery_available === true);

  if (!lguId) {
    if (q.length >= 2) {
      const cities: AdminHomeStorePreviewCity[] = searchPlatformPhLgu(q, { limit: 20 }).map((h) => ({
        id: h.canonicalId,
        name: h.displayName,
      }));
      return NextResponse.json({ ok: true, cities });
    }
    const seen = new Map<string, string>();
    for (const r of rows) {
      const res = resolvePlatformPhLguFromAddressFields({ cityMunicipality: r.city ?? null });
      if (res.status !== "resolved" || seen.has(res.canonicalId)) continue;
      seen.set(res.canonicalId, getPlatformPhLguDisplayNameById(res.canonicalId) ?? res.canonicalId);
    }
    const cities: AdminHomeStorePreviewCity[] = [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, cities });
  }

  const centroid = getPlatformPhLguCentroid(lguId);
  if (!centroid) return NextResponse.json({ ok: false, error: "unknown_lgu" }, { status: 400 });

  const ids = rows.map((r) => String(r.id));
  const [ctx, areaById, ownerDefaults, orderLoad] = await Promise.all([
    loadDeliveryServiceabilityRuntimeContext(sb),
    loadStoreServiceAreaRuntimeMap(sb, ids),
    loadOwnerDefaultAddressByUserId(
      sb,
      rows.map((r) => String(r.owner_user_id ?? ""))
    ),
    loadStoreCompletedOrderCount30dMapWithStatus(sb, ids),
  ]);

  const inArea: (Row & { distanceKm: number | null; status: AdminHomeStorePreviewRow["status"] })[] = [];
  let outOfArea = 0;
  for (const r of rows) {
    const effective = resolveEffectiveStoreRouteAddress(
      r as Parameters<typeof resolveEffectiveStoreRouteAddress>[0],
      ownerDefaults.get(String(r.owner_user_id ?? "").trim())
    ) as Row;
    const slice = areaById.get(r.id);
    const svc = evaluateStoreDeliveryServiceability({
      ctx,
      storeId: r.id,
      storeDeliveryRadiusKm: r.delivery_radius_km,
      customerLat: centroid.lat,
      customerLng: centroid.lng,
      storeLat: effective.lat,
      storeLng: effective.lng,
      authorityMode: slice?.authorityMode ?? DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: slice?.selectedLguIds ?? [],
      memberLguId: lguId,
    });
    const outOfRange = resolveListDistanceOutOfRange({
      originSource: "saved_address",
      serviceabilityApplies: svc.applies,
      reason: svc.reason,
    });
    if (outOfRange) {
      outOfArea += 1;
      continue;
    }
    inArea.push({
      ...r,
      distanceKm: svc.distanceKm,
      status: resolveStoreDiscoveryHomeDisplayStatus({
        business_hours_json: r.business_hours_json,
        is_open: r.is_open ?? null,
        point_commerce_blocked: r.point_commerce_blocked ?? null,
        sales_allowed: r.sales_allowed ?? null,
        is_sample_store: r.is_sample_store,
        delivery_available: r.delivery_available ?? null,
        distanceOutOfRange: false,
      }),
    });
  }

  const menuCounts = new Map<string, number>();
  if (inArea.length > 0) {
    const { data: prods, error: pErr } = await sb
      .from("store_products")
      .select("store_id, thumbnail_url, admin_review_status, store_menu_sections ( is_hidden )")
      .in(
        "store_id",
        inArea.map((r) => r.id)
      )
      .eq("product_status", "active")
      .limit(5000);
    if (pErr) console.error("[api/admin/home-layout/stores-preview] products", pErr.message);
    for (const p of (prods ?? []) as Record<string, unknown>[]) {
      if (!isHomeStoreMenuVisible(p as Parameters<typeof isHomeStoreMenuVisible>[0])) continue;
      const sid = String(p.store_id);
      menuCounts.set(sid, (menuCounts.get(sid) ?? 0) + 1);
    }
  }

  inArea.sort((a, b) => {
    const o = Number(b.status === "open") - Number(a.status === "open");
    if (o !== 0) return o;
    return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  });

  const stores: AdminHomeStorePreviewRow[] = inArea.map((r) => ({
    id: r.id,
    name: String(r.store_name ?? ""),
    categorySlug: r.store_categories?.slug ?? null,
    categoryName: r.store_categories?.name ?? null,
    status: r.status,
    isSample: r.is_sample_store === true,
    distanceKm: r.distanceKm != null ? Math.round(r.distanceKm * 10) / 10 : null,
    visibleMenuCount: menuCounts.get(r.id) ?? 0,
    completedOrderCount30d: orderLoad.status === "ok" ? (orderLoad.counts.get(r.id) ?? 0) : 0,
    firstListedAt: typeof r.first_listed_at === "string" ? r.first_listed_at : null,
  }));

  return NextResponse.json({
    ok: true,
    city: { id: lguId, name: getPlatformPhLguDisplayNameById(lguId) ?? lguId },
    stores,
    outOfArea,
  });
}
