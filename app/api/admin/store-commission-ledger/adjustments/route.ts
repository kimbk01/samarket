import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { resolveStoreCommissionAdjustment } from "@/lib/stores/commission/store-commission-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  invalid_input: 400,
  note_required: 400,
  admin_required: 403,
  obligation_not_found: 404,
  not_in_review: 409,
  order_not_closed: 409,
  rpc_missing: 503,
};

/**
 * 관리자: 취소·환불 주문 수수료 처리 (수수료 환급 / 환급 안 함).
 * 금액 이동은 DB RPC `admin_resolve_store_commission_adjustment` 단일 트랜잭션.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { sb, actor } = gate;

  let body: { order_id?: unknown; decision?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const orderId = String(body.order_id ?? "").trim();
  const decision = body.decision === "refund" || body.decision === "keep" ? body.decision : null;
  const note = String(body.note ?? "").trim().slice(0, 1000);
  if (!orderId || !decision) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (note.length < 2) {
    return NextResponse.json({ ok: false, error: "note_required" }, { status: 400 });
  }

  const res = await resolveStoreCommissionAdjustment(sb, {
    adminUserId: actor.userId,
    orderId,
    decision,
    note,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: ERROR_STATUS[res.error] ?? 500 });
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "store_order",
    target_id: orderId,
    action: decision === "refund" ? "store_commission.refund" : "store_commission.keep",
    after_json: {
      decision,
      note,
      cash_refunded_minor: res.cashRefundedMinor,
      outstanding_cancelled_minor: res.outstandingCancelledMinor,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({
    ok: true,
    decision,
    cashRefundedMinor: res.cashRefundedMinor,
    outstandingCancelledMinor: res.outstandingCancelledMinor,
  });
}
