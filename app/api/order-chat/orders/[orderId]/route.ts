import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import { loadOrderChatSnapshotForOrder } from "@/lib/chat-domain/use-cases/order-chat-snapshot";
import { createOrderChatReadAdapter } from "@/lib/order-chat/order-chat-read-adapter";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { orderId } = await context.params;
  const oid = String(orderId ?? "").trim();
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const startedAt = Date.now();
  const port = createOrderChatReadAdapter(sb as any);
  const result = await loadOrderChatSnapshotForOrder(port, userId, oid);
  if (process.env.CHAT_PERF_LOG === "1") {
    console.info("[order-chat.snapshot]", {
      orderId: oid,
      domain: MESSENGER_MONITORING_LABEL_DOMAIN.store_order,
      ok: result.ok,
      status: result.ok ? 200 : result.status,
      elapsedMs: Date.now() - startedAt,
    });
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.snapshot });
}
