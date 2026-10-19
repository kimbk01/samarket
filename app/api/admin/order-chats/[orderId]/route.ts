import { NextResponse } from "next/server";
import {
  appendChatContentViewAudit,
  readChatAdminReason,
  requireAnyAdminPermission,
} from "@/lib/admin/chat-admin/chat-admin-guards";
import { loadAdminStoreOrderChat } from "@/lib/admin-delivery-orders/load-admin-store-order-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — one store order's chat, read-only (DEF-60 single admin order-chat path).
 * Lookup-only: never ensures / creates / joins a room and never touches unread or read markers.
 * R1-A: `chats` 또는 `business` 권한. 본문 열람은 주문 연결 근거로 서버에서 audit_logs 기록.
 */
export async function GET(req: Request, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAnyAdminPermission(["chats", "business"]);
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!UUID_RE.test(oid)) {
    return NextResponse.json({ ok: false, error: "invalid_order_id" }, { status: 400, headers: NO_STORE });
  }

  try {
    // R1-B C-6: 최신 페이지 먼저, `?before=<messageId>` 로 이전 페이지 (사용자와 같은 id 커서)
    const sp = new URL(req.url).searchParams;
    const r = await loadAdminStoreOrderChat(oid, { before: sp.get("before")?.trim() || null, limit: sp.get("limit") });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error },
        { status: r.error === "order_not_found" || r.error === "anchor_not_found" ? 404 : 500, headers: NO_STORE }
      );
    }
    if (r.view.roomId) {
      await appendChatContentViewAudit(admin.sb, req, {
        actorId: admin.actor.userId,
        targetType: "community_messenger_room",
        roomId: r.view.roomId,
        domain: "store_order",
        basis: "linked_store_order",
        reason: readChatAdminReason(req),
        scope: { orderId: oid, surface: "admin_order_chat", messageCount: r.view.messages.length },
      });
    }
    return NextResponse.json({ ok: true, domain: "store_order", chat: r.view }, { headers: NO_STORE });
  } catch (e) {
    console.error("[admin/order-chats/:orderId]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
