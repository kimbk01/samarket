import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { MESSENGER_MONITORING_LABEL_DOMAIN } from "@/lib/chat-domain/messenger-domains";
import { loadOrderChatSnapshotForPage } from "@/lib/order-chat/load-order-chat-snapshot-for-page";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { orderId } = await context.params;
  const oid = String(orderId ?? "").trim();
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }
  const startedAt = Date.now();
  const result = await loadOrderChatSnapshotForPage(userId, oid);
  if (process.env.CHAT_PERF_LOG === "1") {
    console.info("[order-chat.snapshot]", {
      orderId: oid,
      domain: MESSENGER_MONITORING_LABEL_DOMAIN.store_order,
      ok: result != null && result.ok,
      status: result == null ? 503 : result.ok ? 200 : result.status,
      elapsedMs: Date.now() - startedAt,
    });
  }
  if (result == null) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.snapshot });
}
