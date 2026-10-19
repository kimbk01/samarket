import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  deleteProbabilityRuleDb,
  listProbabilityRulesByPolicyId,
  saveProbabilityRuleDb,
} from "@/lib/points/point-policy-db";
import {
  auditPointPolicyChange,
  pointPolicyLogNote,
  pointPolicyReasonRequiredResponse,
  readPointPolicyAdminReason,
  readPointPolicyRow,
} from "@/lib/points/point-policy-admin-change";
import type { PointProbabilityRule } from "@/lib/types/point-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const policyId = req.nextUrl.searchParams.get("policyId")?.trim() ?? "";
  if (!policyId) return NextResponse.json({ ok: false, error: "policyId_required" }, { status: 400 });
  try {
    const rules = await listProbabilityRulesByPolicyId(gate.sb, policyId);
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const raw = (await req.json().catch(() => ({}))) as Partial<PointProbabilityRule> & {
    deleteId?: string;
    reason?: unknown;
  };
  const { reason: rawReason, ...body } = raw;
  // 공통 포인트 확률 규칙 변경 — 사유 필수 + 변경 전후 감사.
  const reason = readPointPolicyAdminReason(rawReason);
  if (!reason) return pointPolicyReasonRequiredResponse();
  try {
    if (body.deleteId) {
      const beforeRow = await readPointPolicyRow(gate.sb, "point_probability_rules", body.deleteId);
      await deleteProbabilityRuleDb(gate.sb, body.deleteId);
      const auditFlag = await auditPointPolicyChange(gate.sb, req, {
        actorId: gate.actor.userId,
        targetType: "point_probability_rule",
        targetId: body.deleteId,
        action: "point_probability_rule.delete",
        reason,
        before: beforeRow,
        after: null,
      });
      await addPointPolicyLogDb(gate.sb, {
        policyType: "probability_rule",
        relatedId: body.deleteId,
        actionType: "update",
        adminId: gate.actor.userId,
        adminNickname: gate.actor.profile.nickname ?? "",
        note: pointPolicyLogNote("확률 규칙 삭제", reason),
      });
      return NextResponse.json({ ok: true, ...auditFlag });
    }
    const beforeRow = await readPointPolicyRow(gate.sb, "point_probability_rules", body.id);
    const saved = await saveProbabilityRuleDb(gate.sb, body as PointProbabilityRule);
    const auditFlag = await auditPointPolicyChange(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "point_probability_rule",
      targetId: String(saved.id ?? body.id ?? ""),
      action: body.id ? "point_probability_rule.update" : "point_probability_rule.create",
      reason,
      before: beforeRow,
      after: saved as unknown as Record<string, unknown>,
    });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "probability_rule",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: pointPolicyLogNote("확률 규칙 저장", reason),
    });
    return NextResponse.json({ ok: true, rule: saved, ...auditFlag });
  } catch (e) {
    console.error("[admin/point-policies/probability] save failed", e);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}
