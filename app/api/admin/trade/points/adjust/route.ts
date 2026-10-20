import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { handleAdminPointsAdjustPost, handleAdminPointsBalanceGet } from "@/lib/admin/shared-handlers/admin-points-adjust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointsAdjustPost(gate, req);
}

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointsBalanceGet(gate, req);
}
