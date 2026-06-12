import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  listPointExpireExecutions,
  listPointExpireLogs,
  listPointExpirePolicies,
} from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  try {
    const [policies, executions, logs] = await Promise.all([
      listPointExpirePolicies(gate.sb),
      listPointExpireExecutions(gate.sb),
      listPointExpireLogs(gate.sb),
    ]);
    return NextResponse.json({ ok: true, policies, executions, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
