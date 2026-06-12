import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
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
    const policy = await updatePointExpirePolicyDb(gate.sb, id, body);
    return NextResponse.json({ ok: true, policy });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const status = msg === "not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
