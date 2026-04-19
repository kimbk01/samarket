import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { clientSafeInternalErrorMessage, parseJsonBody } from "@/lib/http/api-route";
import { sendOrderChatAdminNote } from "@/lib/order-chat/service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/order-chat/orders/[orderId]/messages
 * body: { text: string } — 관리자 메모(`admin_note`)로 저장, 구매자·사장 미읽음 반영
 */
export async function POST(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = String(orderId ?? "").trim();
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const parsed = await parseJsonBody<{ text?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const text = String(parsed.value.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "empty_message" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const result = await sendOrderChatAdminNote(sb as import("@supabase/supabase-js").SupabaseClient<any>, {
    orderId: oid,
    adminUserId: admin.userId,
    text,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(result.error) },
      { status: result.status }
    );
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "order_chat",
    target_id: oid,
    action: "order_chat.admin_note",
    after_json: { message_id: result.message.id, preview: text.slice(0, 200) },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, message: result.message });
}
