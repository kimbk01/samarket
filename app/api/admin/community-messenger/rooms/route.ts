import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  isAdminCmDomainListDomain,
  listAdminCommunityMessengerRoomsByDomain,
} from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community-messenger/rooms?domain=general_direct|group|store_order
 * Thin domain list — no message preload. Detail: /admin/chats/messenger/[id]
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const domainRaw = req.nextUrl.searchParams.get("domain");
  if (!isAdminCmDomainListDomain(domainRaw)) {
    return NextResponse.json(
      { ok: false, error: "invalid_domain", allowed: ["general_direct", "group", "store_order"] },
      { status: 400 }
    );
  }

  try {
    const rooms = await listAdminCommunityMessengerRoomsByDomain(domainRaw);
    return NextResponse.json({ ok: true, domain: domainRaw, rooms });
  } catch (e) {
    const message = e instanceof Error ? e.message : "list_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
