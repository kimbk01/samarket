import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { handleAdminPointChargesListGet } from "@/lib/admin/shared-handlers/admin-point-charges-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointChargesListGet(gate, req);
}
