import { NextResponse } from "next/server";
import { requireAnyAdminPermission } from "@/lib/admin/chat-admin/chat-admin-guards";
import { listAdminStoreOrderChats } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — store_orders with community_messenger_room_id (lookup-only, no ensure). */
export async function GET() {
  const admin = await requireAnyAdminPermission(["chats", "business"]);
  if (!admin.ok) return admin.response;

  try {
    const rows = await listAdminStoreOrderChats();
    return NextResponse.json({ ok: true, domain: "store_order", rows });
  } catch (e) {
    console.error("[admin/order-chats]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
