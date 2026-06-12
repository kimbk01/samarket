import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  addPointPolicyLogDb,
  deleteProbabilityRuleDb,
  listProbabilityRulesByPolicyId,
  saveProbabilityRuleDb,
} from "@/lib/points/point-policy-db";
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
  const body = (await req.json().catch(() => ({}))) as Partial<PointProbabilityRule> & {
    deleteId?: string;
  };
  try {
    if (body.deleteId) {
      await deleteProbabilityRuleDb(gate.sb, body.deleteId);
      await addPointPolicyLogDb(gate.sb, {
        policyType: "probability_rule",
        relatedId: body.deleteId,
        actionType: "update",
        adminId: gate.actor.userId,
        adminNickname: gate.actor.profile.nickname ?? "",
        note: "확률 규칙 삭제",
      });
      return NextResponse.json({ ok: true });
    }
    const saved = await saveProbabilityRuleDb(gate.sb, body as PointProbabilityRule);
    await addPointPolicyLogDb(gate.sb, {
      policyType: "probability_rule",
      relatedId: saved.id,
      actionType: body.id ? "update" : "create",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: "확률 규칙 저장",
    });
    return NextResponse.json({ ok: true, rule: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
