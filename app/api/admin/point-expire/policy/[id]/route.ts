import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { updatePointExpirePolicyDb, type PointExpirePolicyPatch } from "@/lib/points/point-expire-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  let body: PointExpirePolicyPatch;
  try {
    body = (await req.json()) as PointExpirePolicyPatch;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    // 감사 before — 변경 전 정책 행 (V3-06)
    const { data: beforeRow } = await gate.sb.from("point_expire_policies").select("*").eq("id", id).maybeSingle();
    const policy = await updatePointExpirePolicyDb(gate.sb, id, body);
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "point_expire_policy",
      targetId: id,
      action: "point_expire_policy.update",
      before: (beforeRow ?? null) as Record<string, unknown> | null,
      after: { patch: body as unknown as Record<string, unknown>, policy: policy as unknown as Record<string, unknown> },
    });
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const status = msg === "not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
