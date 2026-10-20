import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { decideStoreCommissionAdjustment } from "@/lib/stores/commission/store-commission-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  invalid_input: 400,
  reason_required: 400,
  invalid_amount: 400,
  idempotency_key_reused: 409,
  admin_required: 403,
  obligation_not_found: 404,
  not_in_review: 409,
  order_not_closed: 409,
  rpc_missing: 503,
};

/**
 * 관리자: 취소·환불 주문 수수료 처리 — 환급 승인(전액/부분) 또는 환급 반려.
 * 금액 이동·결정 기록은 DB `admin_decide_store_commission_adjustment` 단일 트랜잭션.
 * 같은 idempotency_key 재전송은 기록된 결정을 그대로 반환한다(중복 실행 없음).
 */
export async function POST(req: NextRequest) {
  // B-2 (Owner 승인): 수수료 조정 결정 = super_admin 전용.
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const { sb, actor } = gate;

  let body: { order_id?: unknown; decision?: unknown; approved_minor?: unknown; reason?: unknown; idempotency_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const orderId = String(body.order_id ?? "").trim();
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const reason = String(body.reason ?? "").trim().slice(0, 1000);
  const idempotencyKey = String(body.idempotency_key ?? "").trim().slice(0, 200);
  const approvedRaw = body.approved_minor;
  const approvedMinor =
    approvedRaw == null || approvedRaw === "" ? null : Number.isInteger(Number(approvedRaw)) ? Number(approvedRaw) : NaN;
  if (!orderId || !decision || !idempotencyKey || Number.isNaN(approvedMinor)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (reason.length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const res = await decideStoreCommissionAdjustment(sb, {
    adminUserId: actor.userId,
    orderId,
    decision,
    approvedMinor,
    reason,
    idempotencyKey,
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, maxMinor: res.maxMinor },
      { status: ERROR_STATUS[res.error] ?? 500 }
    );
  }

  if (!res.idempotent) {
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "store_order",
      target_id: orderId,
      action: decision === "approve" ? "store_commission.refund_approve" : "store_commission.refund_reject",
      after_json: {
        adjustment_id: res.adjustmentId,
        decision,
        reason,
        approved_minor: res.approvedMinor,
        cash_refund_minor: res.cashRefundMinor,
        outstanding_cancel_minor: res.outstandingCancelMinor,
      },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  }

  // `res.ok` is already `true` here — return it as-is (no duplicate `ok` key).
  return NextResponse.json(res);
}
