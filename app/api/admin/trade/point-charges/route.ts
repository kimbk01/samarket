import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import { handleAdminPointChargesListGet } from "@/lib/admin/shared-handlers/admin-point-charges-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사.
 * R7: 거래 목록 표준 — `limit` 은 20/50/100 만 (그 외 50) 으로 맞춰 공용 처리에 넘긴다 (`total` = exact count).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const { limit, offset } = parseTradeAdminListPage(url.searchParams);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return handleAdminPointChargesListGet(gate, new NextRequest(url, { headers: req.headers }));
}
