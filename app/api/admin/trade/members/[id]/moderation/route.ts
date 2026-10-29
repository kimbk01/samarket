import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminMemberModerationGet, handleAdminMemberModerationPost } from "@/lib/admin/shared-handlers/admin-member-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 거래 Admin (O-2: 활성 관리자 전원) — 원래 라우트와 같은 공용 처리 · 같은 데이터 · 같은 감사 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;
  return handleAdminMemberModerationGet(gate, req, ctx);
}

/** MB-01: 회원 계정 정지·해제는 중앙 `/api/admin/users/[id]/moderation` 과 같은 `users` 키 — 같은 공용 처리 · 같은 감사 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  return handleAdminMemberModerationPost(gate, req, ctx);
}
