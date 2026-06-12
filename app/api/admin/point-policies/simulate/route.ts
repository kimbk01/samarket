import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { computePointRewardSimulation } from "@/lib/point-policies/point-reward-simulate-core";
import {
  getActiveEventPolicyForBoardDb,
  getBoardPointPolicyByKey,
  listProbabilityRulesByPolicyId,
} from "@/lib/points/point-policy-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as {
    boardKey?: string;
    actionType?: "write" | "comment";
    userType?: "free" | "premium";
    currentPointBalance?: number;
  };
  const boardKey = body.boardKey?.trim() || "general";
  const actionType = body.actionType ?? "write";
  const userType = body.userType ?? "free";
  const currentPointBalance = Math.max(0, Number(body.currentPointBalance) || 0);
  try {
    const policy = await getBoardPointPolicyByKey(gate.sb, boardKey);
    const event = await getActiveEventPolicyForBoardDb(gate.sb, boardKey);
    const probabilityRules = policy
      ? await listProbabilityRulesByPolicyId(gate.sb, policy.id)
      : [];
    const result = computePointRewardSimulation({
      boardKey,
      actionType,
      userType,
      currentPointBalance,
      policy,
      event,
      probabilityRules,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
