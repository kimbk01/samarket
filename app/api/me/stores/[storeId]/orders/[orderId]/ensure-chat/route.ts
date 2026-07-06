import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { ensureStoreOrderChatWithBootstrap } from "@/lib/stores/store-order-ensure-chat-with-bootstrap";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 오너 주문 채팅방 ensure + bootstrap(full history). GET 상세는 read-only. */
export async function POST(
  _req: Request,
  context: { params: Promise<{ storeId: string; orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId, orderId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!sid || !oid) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id")
    .eq("id", oid)
    .eq("store_id", sid)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const result = await ensureStoreOrderChatWithBootstrap({
    sb: sb as import("@supabase/supabase-js").SupabaseClient<any>,
    orderId: oid,
    userId,
    route: "owner_ensure_chat",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    community_messenger_room_id: result.roomId,
    order_chat_ready: result.order_chat_ready,
    roomSnapshot: result.roomSnapshot,
  });
}
