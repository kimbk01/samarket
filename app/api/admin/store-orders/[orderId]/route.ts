/**
 * PATCH /api/admin/store-orders/[orderId] — 관리자 주문 메타 (잠금·확인 필요·긴급·메모·운영 예외 표시).
 *
 * - 권한: requireAdminPermission("business")
 * - 동시성: `expected_updated_at` (화면이 본 updated_at) → 조건부 쓰기, 충돌 시 409 `stale_updated_at`.
 *   잠금·확인 필요·긴급은 필수, 메모·운영 예외 표시는 보낼 때만 조건 적용.
 * - 상태 결정 필드(force_cancel · complete_refund · reject_refund · set_order_status)는 레거시 →
 *   410 (E-1 · DEF-8). 결정은 POST …/intervene 만 사용한다. 코드는 게이트 뒤에 보존.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminLegacyOrderWriteGoneResponse,
  isAdminLegacyOrderWriteDisabled,
} from "@/lib/admin/store-orders/admin-legacy-order-write-gate";
import {
  adminPatchStoreOrderMeta,
  type AdminStoreOrderMetaPatch,
} from "@/lib/stores/apply-admin-store-order-operations";
import type { AdminStoreOrderInterventionAction } from "@/lib/admin/store-orders/admin-store-order-intervention-contract";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  force_cancel?: boolean;
  /** 현재는 refund_requested 만 허용 */
  set_order_status?: string;
  complete_refund?: boolean;
  /** Reject refund_requested → restore the status recorded before the request (server-decided) */
  reject_refund?: boolean;
  /** Ignored — the restore status is never client-chosen (kept for old callers). */
  restore_to_status?: string;
  reject_reason?: string;
  /** Required for status decisions (force_cancel / complete_refund / reject_refund / set_order_status). */
  reason?: string;
  expected_status?: string;
  admin_locked?: boolean;
  admin_flagged?: boolean;
  admin_note?: string | null;
  dispute_status?: string | null;
  needs_admin_attention?: boolean;
  /** `updated_at` the admin saw — conditional meta write (409 stale_updated_at on conflict). */
  expected_updated_at?: string;
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let prim = 0;
  if (body.force_cancel === true) prim++;
  if (body.complete_refund === true) prim++;
  if (body.reject_refund === true) prim++;
  if (body.set_order_status != null && String(body.set_order_status).trim() !== "") prim++;
  if (prim > 1) {
    return NextResponse.json({ ok: false, error: "conflicting_actions" }, { status: 400 });
  }

  const rm = getAuditRequestMeta(req);
  const audit = { adminUserId: admin.userId, ip: rm.ip, user_agent: rm.userAgent };

  let decision: AdminStoreOrderInterventionAction | null = null;
  if (body.force_cancel === true) decision = "force_cancel";
  else if (body.complete_refund === true) decision = "refund_approve";
  else if (body.reject_refund === true) decision = "refund_reject";
  else if (body.set_order_status != null && String(body.set_order_status).trim() !== "") {
    if (String(body.set_order_status).trim() !== "refund_requested") {
      return NextResponse.json({ ok: false, error: "unsupported_set_order_status" }, { status: 400 });
    }
    decision = "refund_request_create";
  }

  const DECISION_ROUTE = "PATCH /api/admin/store-orders/[orderId]#decision" as const;
  if (decision && isAdminLegacyOrderWriteDisabled(DECISION_ROUTE)) {
    return adminLegacyOrderWriteGoneResponse(DECISION_ROUTE);
  }

  if (decision) {
    const r = await runAdminStoreOrderIntervention(sb, {
      orderId: oid,
      action: decision,
      reason: body.reason ?? body.reject_reason,
      expectedStatus: typeof body.expected_status === "string" ? body.expected_status : null,
      audit,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
    }
  }

  const meta: AdminStoreOrderMetaPatch = {};
  if (typeof body.admin_locked === "boolean") meta.admin_locked = body.admin_locked;
  if (typeof body.admin_flagged === "boolean") meta.admin_flagged = body.admin_flagged;
  if (body.admin_note !== undefined) meta.admin_note = body.admin_note;
  if (body.dispute_status !== undefined) meta.dispute_status = body.dispute_status;
  if (typeof body.needs_admin_attention === "boolean") meta.needs_admin_attention = body.needs_admin_attention;

  if (prim === 0 && Object.keys(meta).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_body" }, { status: 400 });
  }

  let updatedAt: string | null = null;
  if (Object.keys(meta).length > 0) {
    const r = await adminPatchStoreOrderMeta(sb, oid, meta, audit, {
      expectedUpdatedAt: typeof body.expected_updated_at === "string" ? body.expected_updated_at : null,
    });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.error, ...(r.currentUpdatedAt ? { current_updated_at: r.currentUpdatedAt } : {}) },
        { status: r.httpStatus }
      );
    }
    updatedAt = r.updatedAt;
  }

  return NextResponse.json({ ok: true, ...(updatedAt ? { updated_at: updatedAt } : {}) });
}
