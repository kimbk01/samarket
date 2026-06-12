import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  listPointReclaimPolicies,
  listPointRewardExecutions,
  listPointRewardLogs,
} from "@/lib/points/point-execution-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const [executions, reclaimPolicies, rewardLogs] = await Promise.all([
      listPointRewardExecutions(gate.sb),
      listPointReclaimPolicies(gate.sb),
      listPointRewardLogs(gate.sb),
    ]);
    return NextResponse.json({ ok: true, executions, reclaimPolicies, rewardLogs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
