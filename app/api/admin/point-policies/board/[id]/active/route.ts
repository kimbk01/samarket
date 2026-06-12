import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { addPointPolicyLogDb, setBoardPointPolicyActiveDb } from "@/lib/points/point-policy-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };
  const isActive = Boolean(body.isActive);
  try {
    const policy = await setBoardPointPolicyActiveDb(gate.sb, id, isActive);
    if (!policy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    await addPointPolicyLogDb(gate.sb, {
      policyType: "board_policy",
      relatedId: id,
      actionType: isActive ? "activate" : "deactivate",
      adminId: gate.actor.userId,
      adminNickname: gate.actor.profile.nickname ?? "",
      note: isActive ? "활성화" : "비활성화",
    });
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
