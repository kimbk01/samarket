import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdFundingTracePage } from "@/lib/finance/ad-funding-trace/load-ad-funding-trace-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/ad-funding-traces?storeId=&memberId=&fundingRail=&limit=&offset=
 * R7 — 다섯 출처를 DB 에서 합쳐 필터·정렬·페이지 (RPC `admin_finance_ad_funding_page`). limit 기본 40 · 최대 100.
 * 응답 `{ ok, traces, total, limit, offset }` — `traces` 모양은 예전과 같다 (재무 투명성 패널 호출 호환).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  try {
    const page = await loadAdFundingTracePage(gate.sb, {
      storeId: url.searchParams.get("storeId"),
      memberId: url.searchParams.get("memberId"),
      fundingRail: url.searchParams.get("fundingRail"),
      limit: Math.trunc(Number(url.searchParams.get("limit") || 40)),
      offset: Math.trunc(Number(url.searchParams.get("offset") || 0)),
    });
    return NextResponse.json({ ok: true, ...page });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
