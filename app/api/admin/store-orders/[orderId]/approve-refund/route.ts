/**
 * POST /api/admin/store-orders/[orderId]/approve-refund — legacy path, DISABLED (E-1 · DEF-8 → 410).
 * No admin screen calls it; decisions go through `/intervene` (order detail 「관리자 개입」).
 * Code kept behind the gate: same service as `/intervene` (reason + expected_status required, ADMIN graph, audit).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminLegacyOrderWriteGoneResponse,
  isAdminLegacyOrderWriteDisabled,
} from "@/lib/admin/store-orders/admin-legacy-order-write-gate";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const ROUTE = "POST /api/admin/store-orders/[orderId]/approve-refund" as const;
  if (isAdminLegacyOrderWriteDisabled(ROUTE)) return adminLegacyOrderWriteGoneResponse(ROUTE);
  const admin = { userId: gate.actor.userId };

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
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.currentStatus ? { current_status: result.currentStatus } : {}) },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({ ok: true });
}
