/**
 * Chat/group metadata for Member Control Center.
 * DO NOT select message body/content tables.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { CHAT_DOMAINS, type ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { loadMemberChatTab } from "@/lib/admin-users/member-chat-tab";
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

  const domainRaw = req.nextUrl.searchParams.get("domain")?.trim() || "all";
  const domain =
    domainRaw === "all" || domainRaw === "legacy_group" || (CHAT_DOMAINS as readonly string[]).includes(domainRaw)
      ? (domainRaw as ChatDomain | "all" | "legacy_group")
      : "all";
  const page = parseAdminMemberDomainPage(req.nextUrl.searchParams);
  const payload = await loadMemberChatTab(gate.sb, userId, { domain, ...page });
  return NextResponse.json({ ok: true, ...payload });
}
