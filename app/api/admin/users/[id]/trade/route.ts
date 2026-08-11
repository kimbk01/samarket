import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { loadMemberTradeTab, type MemberTradeSection } from "@/lib/admin-users/member-trade-tab";
import { parseAdminMemberDomainPage } from "@/lib/admin-users/member-tab-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTIONS = new Set<MemberTradeSection>(["listings", "buyer"]);

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

  const sectionRaw = req.nextUrl.searchParams.get("section")?.trim() || "listings";
  const section = SECTIONS.has(sectionRaw as MemberTradeSection) ? (sectionRaw as MemberTradeSection) : "listings";
  const page = parseAdminMemberDomainPage(req.nextUrl.searchParams);
  const payload = await loadMemberTradeTab(gate.sb, userId, { section, ...page });
  return NextResponse.json({ ok: true, ...payload });
}
