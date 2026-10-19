import { NextRequest, NextResponse } from "next/server";
import { requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  isAdminCmDomainListDomain,
  listAdminCommunityMessengerRoomsByDomain,
} from "@/lib/admin-community-messenger/service";
import { listAdminChatRoomsPaged } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import {
  clampAdminChatListLimit,
  parseAdminChatRoomListQuery,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community-messenger/rooms
 * - Paged (C-11): `?type=all|general_direct|group|trade|store_order&status=&q=&user_id=&reported=1&cursor=&limit=`
 *   → `{ ok, rooms, nextCursor }` (keyset, server search incl. participant `user_id`).
 * - Legacy: `?domain=general_direct|group|store_order` (capped 200, no paging).
 * Thin list — no message preload. Detail: /admin/chats/messenger/[id]
 */
export async function GET(req: NextRequest) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  if (sp.has("type")) {
    try {
      const query = parseAdminChatRoomListQuery(sp);
      const page = await listAdminChatRoomsPaged(query, clampAdminChatListLimit(sp.get("limit")));
      return NextResponse.json({ ok: true, rooms: page.rows, nextCursor: page.nextCursor });
    } catch (e) {
      const message = e instanceof Error ? e.message : "list_failed";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const domainRaw = sp.get("domain");
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
