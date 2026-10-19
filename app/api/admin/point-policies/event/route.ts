import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  listPointEventPolicies,
  savePointEventPolicyDb,
  setPointEventPolicyActiveDb,
} from "@/lib/points/point-policy-db";
import {
  auditPointPolicyChange,
  pointPolicyLogNote,
  pointPolicyReasonRequiredResponse,
  readPointPolicyAdminReason,
  readPointPolicyRow,
} from "@/lib/points/point-policy-admin-change";
import type { PointEventPolicy } from "@/lib/types/point-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const policies = await listPointEventPolicies(gate.sb);
    return NextResponse.json({ ok: true, policies });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const raw = (await req.json().catch(() => ({}))) as Partial<PointEventPolicy> & {
    setActive?: { id: string; isActive: boolean };
    reason?: unknown;
  };
  const { reason: rawReason, ...body } = raw;
  // 공통 포인트 이벤트 정책 변경 — 사유 필수 + 변경 전후 감사.
  const reason = readPointPolicyAdminReason(rawReason);
  if (!reason) return pointPolicyReasonRequiredResponse();
  try {
    if (body.setActive) {
      const beforeRow = await readPointPolicyRow(gate.sb, "point_event_policies", body.setActive.id);
      const policy = await setPointEventPolicyActiveDb(
        gate.sb,
        body.setActive.id,
        body.setActive.isActive
      );
      if (!policy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      const auditFlag = await auditPointPolicyChange(gate.sb, req, {
        actorId: gate.actor.userId,
        targetType: "point_event_policy",
        targetId: body.setActive.id,
        action: body.setActive.isActive ? "point_event_policy.activate" : "point_event_policy.deactivate",
        reason,
        before: beforeRow,
        after: policy as unknown as Record<string, unknown>,
      });
      await addPointPolicyLogDb(gate.sb, {
        policyType: "event_policy",
        relatedId: body.setActive.id,
        actionType: body.setActive.isActive ? "activate" : "deactivate",
        adminId: gate.actor.userId,
        adminNickname: gate.actor.profile.nickname ?? "",
        note: pointPolicyLogNote(body.setActive.isActive ? "활성화" : "비활성화", reason),
      });
      return NextResponse.json({ ok: true, policy, ...auditFlag });
    }
    const beforeRow = await readPointPolicyRow(gate.sb, "point_event_policies", body.id);
    const saved = await savePointEventPolicyDb(gate.sb, body as PointEventPolicy);
    const auditFlag = await auditPointPolicyChange(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "point_event_policy",
      targetId: String(saved.id ?? body.id ?? ""),
      action: body.id ? "point_event_policy.update" : "point_event_policy.create",
      reason,
      before: beforeRow,
      after: saved as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "event_policy",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: pointPolicyLogNote(body.id ? "이벤트 정책 수정" : "이벤트 정책 생성", reason),
    });
    return NextResponse.json({ ok: true, policy: saved, ...auditFlag });
  } catch (e) {
    console.error("[admin/point-policies/event] save failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
