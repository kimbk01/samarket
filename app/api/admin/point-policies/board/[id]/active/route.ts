import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { addPointPolicyLogDb, setBoardPointPolicyActiveDb } from "@/lib/points/point-policy-db";
import {
  auditPointPolicyChange,
  pointPolicyLogNote,
  pointPolicyReasonRequiredResponse,
  readPointPolicyAdminReason,
  readPointPolicyRow,
} from "@/lib/points/point-policy-admin-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean; reason?: unknown };
  const isActive = Boolean(body.isActive);
  const reason = readPointPolicyAdminReason(body.reason);
  if (!reason) return pointPolicyReasonRequiredResponse();
  try {
    const beforeRow = await readPointPolicyRow(gate.sb, "board_point_policies", id);
    const policy = await setBoardPointPolicyActiveDb(gate.sb, id, isActive);
    if (!policy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const auditFlag = await auditPointPolicyChange(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "community_point_policy",
      targetId: id,
      action: isActive ? "community_point_policy.activate" : "community_point_policy.deactivate",
      reason,
      before: beforeRow,
      after: policy as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: id,
      actionType: isActive ? "activate" : "deactivate",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: pointPolicyLogNote(isActive ? "활성화" : "비활성화", reason),
    });
    return NextResponse.json({ ok: true, policy, ...auditFlag });
  } catch (e) {
    console.error("[admin/point-policies/board/active] update failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
