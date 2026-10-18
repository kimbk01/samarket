/**
 * POST /api/admin/store-orders/[orderId]/approve-refund — legacy path.
 * Same service as `/intervene` (reason required, ADMIN graph, audit). Body: { reason, expected_status? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; expected_status?: unknown };

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const rm = getAuditRequestMeta(req);
  const result = await runAdminStoreOrderIntervention(sb, {
    orderId: oid,
    action: "refund_approve",
    reason: body.reason,
    expectedStatus: typeof body.expected_status === "string" ? body.expected_status : null,
    audit: { adminUserId: admin.userId, ip: rm.ip, user_agent: rm.userAgent },
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({ ok: true });
}
