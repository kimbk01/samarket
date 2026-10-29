import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { handleAdminMemberModerationGet, handleAdminMemberModerationPost } from "@/lib/admin/shared-handlers/admin-member-moderation";

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
