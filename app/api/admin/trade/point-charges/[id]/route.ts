import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { handleAdminPointChargeGet, handleAdminPointChargePatch } from "@/lib/admin/shared-handlers/admin-point-charge-item";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointChargeGet(gate, req, ctx);
}

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointChargePatch(gate, req, ctx);
}
