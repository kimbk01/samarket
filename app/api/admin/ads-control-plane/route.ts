import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import type { AdsActionItem, AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import {
  ADS_BOOST_ORDER_URL_PARAM,
  isAdsBoostOrderIdParam,
} from "@/lib/admin/ads-exposure/boost-order-deep-link";
import {
  collectAdsWorkspacePool,
  filterAdsWorkspaceRowsByMode,
  type AdvertisingWorkspaceMode,
} from "@/lib/admin/advertising-workspace/workspace-summary";
import {
  filterShellRowsByProductFamily,
  filterShellRowsByTab,
  toAdsShellListRow,
  type AdsShellProductFamily,
  type AdsShellStatusTab,
} from "@/lib/admin/ads-exposure/shell-row";
import {
  normalizeAdminListPageSize,
  normalizeAdminListSearch,
} from "@/lib/admin/list-query/admin-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_MODES: readonly AdvertisingWorkspaceMode[] = [
  "all",
  "applications",
  "operations",
  "history",
  "boosts",
];
const STATUS_TABS: readonly AdsShellStatusTab[] = [
  "all",
  "pending",
  "incomplete",
  "scheduled",
  "live",
  "waiting",
  "paused",
  "ended",
  "rejected",
];
const FAMILIES: readonly AdsShellProductFamily[] = ["all", "promote", "banner", "popup", "sponsored"];
const MAX_OFFSET = 100_000;

/**
 * 광고 워크스페이스 목록 한 쪽 (서버 페이지) — `limit` 이 있을 때만 계산한다.
 * 화면과 같은 투영·필터(`toAdsShellListRow` → 화면 mode → 종류 → 상태 탭 → 검색어)를 서버에서 적용하고
 * 해당 쪽 행과 전체 건수만 돌려준다. 원본 창은 로더의 제품군별 조회 범위 그대로.
 */
function buildWorkspaceListPage(
  model: AdsControlPlaneModel,
  sp: URLSearchParams
): { items: AdsActionItem[]; total: number; limit: number; offset: number } {
  const modeRaw = (sp.get("mode") ?? "").trim() as AdvertisingWorkspaceMode;
  const mode = WORKSPACE_MODES.includes(modeRaw) ? modeRaw : "all";
  const statusRaw = (sp.get("status") ?? "").trim() as AdsShellStatusTab;
  const status = STATUS_TABS.includes(statusRaw) ? statusRaw : "all";
  const familyRaw = (sp.get("family") ?? "").trim() as AdsShellProductFamily;
  const family = FAMILIES.includes(familyRaw) ? familyRaw : "all";
  const q = normalizeAdminListSearch(sp.get("q")).toLowerCase();
  const limit = normalizeAdminListPageSize(sp.get("limit"));
  const offsetN = Number((sp.get("offset") ?? "").trim());
  const offset =
    Number.isSafeInteger(offsetN) && offsetN > 0 ? Math.min(offsetN, MAX_OFFSET) : 0;

  const pool = collectAdsWorkspacePool(model);
  const byId = new Map(pool.map((i) => [i.id, i] as const));
  let rows = pool.map((i) => toAdsShellListRow(i, true, mode));
  rows = filterAdsWorkspaceRowsByMode(rows, mode);
  rows = filterShellRowsByProductFamily(rows, family);
  rows = filterShellRowsByTab(rows, status);
  if (q) {
    rows = rows.filter((r) => {
      const item = byId.get(r.id);
      return [
        r.title,
        r.applicantLabel,
        r.targetLabel,
        r.memberOrStore,
        r.kindLabel,
        r.placementLabel,
        item?.title,
        item?.applicantLabel,
        item?.id,
      ].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }
  const items = rows
    .slice(offset, offset + limit)
    .map((r) => byId.get(r.id))
    .filter((i): i is AdsActionItem => i != null);
  return { items, total: rows.length, limit, offset };
}

/**
 * GET /api/admin/ads-control-plane — read-only Ads/Exposure composition.
 * Optional `store_id` (uuid; 400 invalid_store_id) scopes rows server-side — see
 * `LoadAdsControlPlaneOptions.storeId` for per-family semantics (store-less rows are excluded).
 * Optional workspace list page (`limit` 20/50/100 · `offset` · `mode` · `status` · `family` · `q`):
 * adds `page: { items, total, limit, offset }`. Without `limit` the response is unchanged.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const storeId = (req.nextUrl.searchParams.get("store_id") ?? "").trim();
  if (storeId && !isUuidLikeString(storeId)) {
    return NextResponse.json({ ok: false, error: "invalid_store_id" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const raw = (req.nextUrl.searchParams.get(ADS_BOOST_ORDER_URL_PARAM) ?? "").trim();
    const ensureBoostOrderId = isAdsBoostOrderIdParam(raw) ? raw : undefined;
    const model = await loadAdsControlPlane(sb, {
      ensureBoostOrderId,
      storeId: storeId || undefined,
    });
    if (req.nextUrl.searchParams.has("limit")) {
      return NextResponse.json({
        ok: true,
        plane: model,
        page: buildWorkspaceListPage(model, req.nextUrl.searchParams),
      });
    }
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    console.error("[ads-control-plane]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
