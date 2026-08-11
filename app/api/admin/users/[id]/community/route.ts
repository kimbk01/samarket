import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { loadMemberCommunityTab, type MemberCommunitySection } from "@/lib/admin-users/member-community-tab";
import { parseAdminMemberDomainPage } from "@/lib/admin-users/member-tab-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTIONS = new Set<MemberCommunitySection>(["posts", "comments", "reports", "ads"]);

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

  const sectionRaw = req.nextUrl.searchParams.get("section")?.trim() || "posts";
  const section = SECTIONS.has(sectionRaw as MemberCommunitySection)
    ? (sectionRaw as MemberCommunitySection)
    : "posts";
  const page = parseAdminMemberDomainPage(req.nextUrl.searchParams);
  const payload = await loadMemberCommunityTab(gate.sb, userId, { section, ...page });
  return NextResponse.json({ ok: true, ...payload });
}
