import { NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/trade-post-ads/[id] — 레거시 `trade_post_ads` (거래 Admin 설계 v2 · D-23).
 * 신규 신청이 막힌 이전 광고 경로이며 운영 행 0건. 임의 상태 지정으로 보류 포인트가 남던 관리 쓰기를 닫고
 * 이력 조회(GET /api/admin/trade-post-ads)만 남긴다. 현재 거래 홍보는 /admin/trade/promotions.
 */
export async function PATCH() {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ ok: false, error: "legacy_read_only" }, { status: 410 });
}
