import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listBoardPointPolicies,
  saveBoardPointPolicyDb,
} from "@/lib/points/point-policy-db";
import type { BoardPointPolicy } from "@/lib/types/point-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const policies = await listBoardPointPolicies(gate.sb);
    return NextResponse.json({ ok: true, policies });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as Partial<BoardPointPolicy>;
  try {
    const saved = await saveBoardPointPolicyDb(gate.sb, body as BoardPointPolicy);
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: body.id ? "게시판 정책 수정" : "게시판 정책 생성",
    });
    return NextResponse.json({ ok: true, policy: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
