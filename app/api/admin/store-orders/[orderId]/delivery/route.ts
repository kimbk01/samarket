import { NextRequest, NextResponse } from "next/server";

import { getAuditRequestMeta } from "@/lib/audit/request-meta";

import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

/** confirmAdminAction 의 사유 최소 길이와 동일 (클라이언트 모듈은 서버에서 import 하지 않는다). */
const ADMIN_REASON_MIN_LENGTH = 2;

import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

import { augmentAdminDeliveryRowWithProofViews } from "@/lib/stores/delivery-proof-admin-view";
import {
  adminOrchestrateDeliveryRelease,
  adminPatchStoreOrderDelivery,
  STORE_ORDER_DELIVERY_ROW_SELECT,
} from "@/lib/stores/store-order-delivery-service";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";



type PatchBody = {

  assign_rider_id?: string | null;

  reassign_rider_id?: string | null;

  set_delivery_status?: string | null;

  /** 관리자 메모 누적 (DEF-21) — 서버가 기존 메모 뒤에 덧붙인다. 덮어쓰기(`admin_note`)는 받지 않는다. */
  append_admin_note?: string | null;

  /** 재배정 CAS — 화면이 본 현재 라이더 id (미배정 = null) */
  expected_rider_id?: string | null;

  /** 처리 사유 — 재배정·배달 실패는 필수(L2), 배정 해제는 선택. 감사 기록에 남는다. */
  reason?: string | null;

  failure_reason?: string | null;

  allow_offline_assign?: boolean;

  /** 라이더 풀로 안전하게 되돌림 — 상태별 허용 전이만 사용 */

  release_delivery_assignment?: boolean;

};



export async function GET(_req: Request, context: { params: Promise<{ orderId: string }> }) {

  const admin = await requireAdminApiUser();

  if (!admin.ok) return admin.response;



  const { orderId } = await context.params;

  const oid = typeof orderId === "string" ? orderId.trim() : "";

  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });



  const sb = tryGetSupabaseForStores();

  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });



  const { data, error } = await sb.from("store_order_deliveries").select(STORE_ORDER_DELIVERY_ROW_SELECT).eq("order_id", oid).maybeSingle();



  if (error) {

    if (/store_order_deliveries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {

      return NextResponse.json({ ok: false, error: "schema_missing_store_order_deliveries" }, { status: 503 });

    }

    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  }



  const augmented = await augmentAdminDeliveryRowWithProofViews(sb, (data as Record<string, unknown>) ?? null);

  return NextResponse.json({ ok: true, delivery: augmented });

}



export async function PATCH(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {

  const gate = await requireAdminPermission("business");

  if (!gate.ok) return gate.response;

  const admin = { userId: gate.actor.userId };



  const { orderId } = await context.params;

  const oid = typeof orderId === "string" ? orderId.trim() : "";

  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });



  let body: PatchBody;

  try {

    body = (await req.json()) as PatchBody;

  } catch {

    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  }



  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 600) : "";

  const reassignTo = typeof body.reassign_rider_id === "string" ? body.reassign_rider_id.trim() : "";

  const marksFailed = body.set_delivery_status === "delivery_failed";

  if ((reassignTo || marksFailed) && reason.length < ADMIN_REASON_MIN_LENGTH) {

    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  }

  if (reassignTo && body.expected_rider_id === undefined) {

    return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });

  }

  if (reassignTo && typeof body.expected_rider_id === "string" && body.expected_rider_id.trim() === reassignTo) {

    return NextResponse.json({ ok: false, error: "same_rider" }, { status: 400 });

  }



  const sb = tryGetSupabaseForStores();

  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });



  const rm = getAuditRequestMeta(req);

  const auditBase = {

    adminUserId: admin.userId,

    ip: rm.ip,

    user_agent: rm.userAgent,

  };



  if (body.release_delivery_assignment === true) {

    const result = await adminOrchestrateDeliveryRelease(sb, {

      orderId: oid,

      ...auditBase,

      failureReason: body.failure_reason ?? null,

    });

    if (!result.ok) {

      return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

    }

    await appendAdminRouteAudit(gate.sb, req, {

      actorId: admin.userId,

      targetType: "store_order",

      targetId: oid,

      action: "store_order.delivery.admin_release",

      before: { delivery_status: result.previous_status },

      after: { delivery_status: result.row.delivery_status, reason: reason || null },

    });

    const augmented = await augmentAdminDeliveryRowWithProofViews(
      sb,
      result.row as unknown as Record<string, unknown>
    );

    return NextResponse.json({ ok: true, delivery: augmented, previous_status: result.previous_status });

  }



  const result = await adminPatchStoreOrderDelivery(sb, {

    orderId: oid,

    ...auditBase,

    assignRiderId: body.assign_rider_id ?? undefined,

    reassignRiderId: body.reassign_rider_id ?? undefined,

    setStatus: body.set_delivery_status ?? undefined,

    appendAdminNote: typeof body.append_admin_note === "string" ? body.append_admin_note : undefined,

    expectedRiderId: reassignTo
      ? typeof body.expected_rider_id === "string" && body.expected_rider_id.trim()
        ? body.expected_rider_id.trim()
        : null
      : undefined,

    failureReason: marksFailed ? (body.failure_reason ?? reason) : (body.failure_reason ?? undefined),

    allowOfflineAssign: body.allow_offline_assign === true,

  });



  if (!result.ok) {

    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  }

  if (reassignTo) {

    // 재배정 기록 — 관리자 메모와 분리된 별도 감사 기록 (DEF-21)

    await appendAdminRouteAudit(gate.sb, req, {

      actorId: admin.userId,

      targetType: "store_order",

      targetId: oid,

      action: "store_order.delivery.admin_reassign",

      before: { rider_id: typeof body.expected_rider_id === "string" ? body.expected_rider_id : null },

      after: { rider_id: result.row.rider_id ?? null, reason, allow_offline_assign: body.allow_offline_assign === true },

    });

  } else if (marksFailed) {

    await appendAdminRouteAudit(gate.sb, req, {

      actorId: admin.userId,

      targetType: "store_order",

      targetId: oid,

      action: "store_order.delivery.admin_mark_failed",

      before: { delivery_status: result.previous_status },

      after: { delivery_status: result.row.delivery_status, reason },

    });

  }



  const augmented = await augmentAdminDeliveryRowWithProofViews(
    sb,
    result.row as unknown as Record<string, unknown>
  );

  return NextResponse.json({ ok: true, delivery: augmented, previous_status: result.previous_status });

}


