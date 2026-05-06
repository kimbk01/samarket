import { NextRequest, NextResponse } from "next/server";

import { getAuditRequestMeta } from "@/lib/audit/request-meta";

import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

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

  admin_note?: string | null;

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

  const admin = await requireAdminApiUser();

  if (!admin.ok) return admin.response;



  const { orderId } = await context.params;

  const oid = typeof orderId === "string" ? orderId.trim() : "";

  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });



  let body: PatchBody;

  try {

    body = (await req.json()) as PatchBody;

  } catch {

    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

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

    adminNote: body.admin_note,

    failureReason: body.failure_reason ?? undefined,

    allowOfflineAssign: body.allow_offline_assign === true,

  });



  if (!result.ok) {

    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  }



  const augmented = await augmentAdminDeliveryRowWithProofViews(
    sb,
    result.row as unknown as Record<string, unknown>
  );

  return NextResponse.json({ ok: true, delivery: augmented, previous_status: result.previous_status });

}


