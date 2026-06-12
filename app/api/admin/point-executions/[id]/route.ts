import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  getPointRewardExecutionByIdDb,
  listPointRewardLogsByExecutionId,
} from "@/lib/points/point-execution-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  try {
    const execution = await getPointRewardExecutionByIdDb(gate.sb, id);
    if (!execution) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const logs = await listPointRewardLogsByExecutionId(gate.sb, id);
    return NextResponse.json({ ok: true, execution, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
