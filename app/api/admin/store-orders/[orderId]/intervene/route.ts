/**
 * POST /api/admin/store-orders/[orderId]/intervene — 관리자 예외 개입 (주문 상세 「관리자 개입」).
 * Body: { action, reason, expected_status }
 * Contract: lib/admin/store-orders/admin-store-order-intervention-contract.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isAdminStoreOrderInterventionAction } from "@/lib/admin/store-orders/admin-store-order-intervention-contract";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { action?: unknown; reason?: unknown; expected_status?: unknown };

export async function POST(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isAdminStoreOrderInterventionAction(body.action)) {
    return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  }
  const expected = typeof body.expected_status === "string" ? body.expected_status.trim() : "";
  if (!expected) return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const rm = getAuditRequestMeta(req);
  const r = await runAdminStoreOrderIntervention(sb, {
    orderId: oid,
    action: body.action,
    reason: body.reason,
    expectedStatus: expected,
    audit: { adminUserId: admin.userId, ip: rm.ip, user_agent: rm.userAgent },
  });
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error, ...(r.currentStatus ? { current_status: r.currentStatus } : {}) },
      { status: r.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, from_status: r.fromStatus, order_status: r.toStatus });
}
