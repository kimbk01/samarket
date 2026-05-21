import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { runEnsureStoreOrderChatForRoute } from "@/lib/stores/ensure-store-order-chat-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 주문 채팅방 ensure (mutation). GET 상세는 read-only.
 * Response: { ok, community_messenger_room_id, order_chat_ready }
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const buyerId = await getRouteUserId();
  if (!buyerId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(buyerId);
  if (!session.ok) return session.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, buyer_user_id")
    .eq("id", oid)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const ensured = await runEnsureStoreOrderChatForRoute({
    sb: sb as import("@supabase/supabase-js").SupabaseClient<any>,
    orderId: oid,
    userId: buyerId,
    route: "buyer_ensure_chat",
  });

  if (!ensured.ok) {
    return NextResponse.json({ ok: false, error: ensured.error }, { status: ensured.status });
  }

  return NextResponse.json({
    ok: true,
    community_messenger_room_id: ensured.roomId,
    order_chat_ready: ensured.order_chat_ready,
  });
}
