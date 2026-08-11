import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { loadMemberOrdersTab } from "@/lib/admin-users/member-orders-tab";
import { parseAdminMemberDomainPage } from "@/lib/admin-users/member-tab-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const page = parseAdminMemberDomainPage(req.nextUrl.searchParams);
  const payload = await loadMemberOrdersTab(gate.sb, userId, page);
  return NextResponse.json({ ok: true, ...payload });
}
