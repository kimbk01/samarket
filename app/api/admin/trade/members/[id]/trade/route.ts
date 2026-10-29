import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminMemberTradeGet } from "@/lib/admin/shared-handlers/admin-member-trade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 Admin 회원 조회 — 중앙 `/api/admin/users/[id]/*` 와 같은 공용 처리 · 같은 데이터 · 같은 감사 · 같은 `users` 키 (G-15) */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // G-15: 같은 회원 정보 조회 = 중앙 `/api/admin/users*` 와 같은 `users` 키 (거래 화면 진입점도 동일)
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  return handleAdminMemberTradeGet(gate, req, ctx);
}
