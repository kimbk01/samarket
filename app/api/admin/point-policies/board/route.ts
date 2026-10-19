import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listBoardPointPolicies,
  saveBoardPointPolicyDb,
} from "@/lib/points/point-policy-db";
import {
  auditPointPolicyChange,
  pointPolicyLogNote,
  pointPolicyReasonRequiredResponse,
  readPointPolicyAdminReason,
  readPointPolicyRow,
} from "@/lib/points/point-policy-admin-change";
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
  const raw = (await req.json().catch(() => ({}))) as Partial<BoardPointPolicy> & { reason?: unknown };
  const { reason: rawReason, ...body } = raw;
  // C-19: 공통 포인트 지급 규칙 변경 — 사유 필수(커뮤니티·공통 화면 모두 L2+ 사유를 보낸다) + 변경 전후 감사.
  const reason = readPointPolicyAdminReason(rawReason);
  if (!reason) return pointPolicyReasonRequiredResponse();
  try {
    const beforeRow = await readPointPolicyRow(gate.sb, "board_point_policies", body.id);
    const saved = await saveBoardPointPolicyDb(gate.sb, body as BoardPointPolicy);
    const auditFlag = await auditPointPolicyChange(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "community_point_policy",
      targetId: String(saved.id ?? body.id ?? ""),
      action: body.id ? "community_point_policy.update" : "community_point_policy.create",
      reason,
      before: beforeRow,
      after: saved as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: pointPolicyLogNote(body.id ? "게시판 정책 수정" : "게시판 정책 생성", reason),
    });
    return NextResponse.json({ ok: true, policy: saved, ...auditFlag });
  } catch (e) {
    console.error("[admin/point-policies/board] save failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
