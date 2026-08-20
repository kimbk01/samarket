import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listAdminStoreOrderChats } from "@/lib/admin-delivery-orders/list-admin-store-order-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — store_orders with community_messenger_room_id (lookup-only, no ensure). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const rows = await listAdminStoreOrderChats();
    return NextResponse.json({ ok: true, domain: "store_order", rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "list_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
