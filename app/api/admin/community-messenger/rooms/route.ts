import { NextRequest, NextResponse } from "next/server";
import { requireAnyAdminPermission, requireChatAdmin, requireTradeChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import { chatRoomAdminPermissionKeys } from "@/lib/admin/chat-admin/chat-content-access-policy";
import {
  isAdminCmDomainListDomain,
  listAdminCommunityMessengerRoomsByDomain,
} from "@/lib/admin-community-messenger/service";
import { listAdminChatRoomsPaged } from "@/lib/admin-community-messenger/list-admin-rooms-paged";
import {
  clampAdminChatListLimit,
  parseAdminChatRoomListQuery,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community-messenger/rooms
 * - Paged (C-11): `?type=all|general_direct|group|trade|store_order&status=&q=&user_id=&reported=1&cursor=&limit=`
 *   → `{ ok, rooms, nextCursor }` (keyset, server search incl. participant `user_id`).
 * - 쪽 번호 (R7 목록 표준): `offset` 이 있으면 `limit`(20/50/100, 그 외 20)·`offset` → `{ ok, rooms, total, limit, offset }`.
 *   `offset` 이 없는 기존 호출자(연결 채팅방 카드 등)는 keyset 응답 그대로.
 * - Legacy: `?domain=general_direct|group|store_order` (capped 200, no paging).
 * Thin list — no message preload. Detail: /admin/chats/messenger/[id]
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.has("type")) {
    const query = parseAdminChatRoomListQuery(sp);
    // 설계 §2-2: 거래 목록은 `products`, 배달 주문 목록은 `business` 도 허용 (전체·일반·그룹은 `chats`).
    const admin =
      query.type === "trade"
        ? await requireTradeChatAdmin() // 거래 Admin O-2: 활성 관리자 전원
        : query.type === "store_order"
          ? await requireAnyAdminPermission(chatRoomAdminPermissionKeys(query.type))
          : await requireChatAdmin();
    if (!admin.ok) return admin.response;
    try {
      if (sp.has("offset")) {
        const limit = normalizeAdminListPageSize(sp.get("limit"));
        const { offset } = parseAdminListPage(sp);
        const page = await listAdminChatRoomsPaged(query, limit, { offset });
        return NextResponse.json({ ok: true, rooms: page.rows, total: page.total ?? 0, limit, offset });
      }
      const page = await listAdminChatRoomsPaged(query, clampAdminChatListLimit(sp.get("limit")));
      return NextResponse.json({ ok: true, rooms: page.rows, nextCursor: page.nextCursor });
    } catch (e) {
      const message = e instanceof Error ? e.message : "list_failed";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;
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
