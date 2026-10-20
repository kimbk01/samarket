import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import {
  loadAdsControlPlane,
  type AdsWorkspacePageQuery,
} from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  ADS_BOOST_ORDER_URL_PARAM,
  isAdsBoostOrderIdParam,
} from "@/lib/admin/ads-exposure/boost-order-deep-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 한 페이지 최대 건수 (AdminPagination 20/50/100 · 로더 ADS_WORKSPACE_PAGE_MAX_LIMIT 와 같은 값). */
const ADS_WORKSPACE_PAGE_MAX_LIMIT = 100;
const MODES = new Set(["all", "applications", "operations", "history", "boosts"]);
const STATUS_TABS = new Set(["all", "pending", "scheduled", "live", "waiting", "incomplete", "paused", "ended", "rejected"]);
const FAMILIES = new Set(["all", "promote", "banner", "popup", "sponsored"]);

/**
 * GET /api/admin/ads-control-plane — read-only Ads/Exposure composition.
 * Optional `store_id` (uuid; 400 invalid_store_id) scopes rows server-side — see
 * `LoadAdsControlPlaneOptions.storeId` for per-family semantics (store-less rows are excluded).
 * R7 서버 페이지: `mode`·`status`(상태 탭)·`family`(종류 탭)·`limit`(최대 100)·`offset` →
 * `plane.applications` = 그 조건의 한 페이지, `plane.page.total` = 전체 건수, `plane.summaryCounts` = 모드별 탭 개수.
 * 파라미터가 없으면 기본(전체·첫 페이지) — 응답 모양은 같다 (대시보드·위치 점유 패널 호환).
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
    const sp = req.nextUrl.searchParams;
    const pick = (key: string, allowed: Set<string>) => {
      const v = (sp.get(key) ?? "").trim();
      return allowed.has(v) ? v : "all";
    };
    const listPage = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: ADS_WORKSPACE_PAGE_MAX_LIMIT });
    const page: AdsWorkspacePageQuery = {
      mode: pick("mode", MODES) as AdsWorkspacePageQuery["mode"],
      status: pick("status", STATUS_TABS),
      family: pick("family", FAMILIES),
      limit: listPage.limit,
      offset: listPage.offset,
    };
    const model = await loadAdsControlPlane(sb, {
      ensureBoostOrderId,
      storeId: storeId || undefined,
      page,
    });
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    console.error("[ads-control-plane]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
