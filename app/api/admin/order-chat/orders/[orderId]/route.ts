import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { getOrderChatSnapshotForAdmin } from "@/lib/order-chat/service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/order-chat/orders/[orderId]
 * 관리자 — Supabase `order_chat_*` 실데이터 스냅샷 (구매자/사장 세션 불필요)
 */
export async function GET(_req: Request, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = String(orderId ?? "").trim();
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await getOrderChatSnapshotForAdmin(sb as import("@supabase/supabase-js").SupabaseClient<any>, oid);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(result.error) },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    room: result.room,
    orderStatus: result.orderStatus,
    messages: result.messages,
  });
}
