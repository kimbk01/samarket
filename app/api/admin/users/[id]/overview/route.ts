import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { permissionKeyAllowed } from "@/lib/admin/admin-user-server";
import { loadMemberOverviewAggregates } from "@/lib/admin-users/member-overview-aggregates";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const includePoints = gate.actor.isSuperAdmin || permissionKeyAllowed(gate.actor.permissions, "point");
  const overview = await loadMemberOverviewAggregates(gate.sb, userId, { includePoints });
  return NextResponse.json({ ok: true, overview });
}
