import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminPointsAdjustPost, handleAdminPointsBalanceGet } from "@/lib/admin/shared-handlers/admin-points-adjust";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FN-01: 포인트 지급·회수는 중앙 `/api/admin/points/adjust` 와 같은 `point` 키 — 같은 공용 처리 · 같은 감사 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  return handleAdminPointsAdjustPost(gate, req);
}

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminPointsBalanceGet(gate, req);
}
