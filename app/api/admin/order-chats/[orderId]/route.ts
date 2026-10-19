import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadAdminStoreOrderChat } from "@/lib/admin-delivery-orders/load-admin-store-order-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET — one store order's chat, read-only (DEF-60 single admin order-chat path).
 * Lookup-only: never ensures / creates / joins a room and never touches unread or read markers.
 */
export async function GET(_req: Request, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!UUID_RE.test(oid)) {
    return NextResponse.json({ ok: false, error: "invalid_order_id" }, { status: 400, headers: NO_STORE });
  }

  try {
    const r = await loadAdminStoreOrderChat(oid);
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error },
        { status: r.error === "order_not_found" ? 404 : 500, headers: NO_STORE }
      );
    }
    return NextResponse.json({ ok: true, domain: "store_order", chat: r.view }, { headers: NO_STORE });
  } catch (e) {
    console.error("[admin/order-chats/:orderId]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
