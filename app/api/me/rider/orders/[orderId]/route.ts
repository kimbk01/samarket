import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { stripDeliveryProofStorageFromClientRow } from "@/lib/stores/delivery-proof-admin-view";
import {
  getDeliveryRiderForUser,
  riderPatchStoreOrderDelivery,
  STORE_ORDER_DELIVERY_ROW_SELECT,
  type RiderDeliverPodPayload,
} from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody =
  | { action: "accept" }
  | { action: "decline"; reason?: string | null }
  | { action: "customer_arrived" }
  | {
      action: "set_delivery_status";
      delivery_status: string;
      pod?: RiderDeliverPodPayload | null;
    }
  | {
      action: "report_delivery_failure";
      reason: string;
      note?: string | null;
      failure_proof_image_path?: string | null;
      failure_proof_image_url?: string | null;
      lat?: number | null;
      lng?: number | null;
    };

export async function GET(_req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { orderId } = await context.params;
  const oid = typeof orderId === "string" ? orderId.trim() : "";
  if (!oid) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const riderGate = await getDeliveryRiderForUser(sb, userId);
  if (!riderGate.ok) {
    return NextResponse.json({ ok: false, error: riderGate.error }, { status: riderGate.httpStatus });
  }

  const { data: del, error: dErr } = await sb
    .from("store_order_deliveries")
    .select(STORE_ORDER_DELIVERY_ROW_SELECT)
    .eq("order_id", oid)
    .maybeSingle();

  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });
  if (!del) return NextResponse.json({ ok: false, error: "delivery_not_found" }, { status: 404 });
  if (safeTrim((del as { rider_id?: string | null }).rider_id) !== riderGate.rider.id) {
    return NextResponse.json({ ok: false, error: "rider_not_assigned_to_order" }, { status: 403 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, order_status, store_id, fulfillment_type, delivery_address_summary, delivery_address_detail, buyer_phone, payment_amount, buyer_note"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });

  const { data: storeRow } = await sb
    .from("stores")
    .select("id, store_name, slug, region, city, district, address_line1, address_line2")
    .eq("id", (order as { store_id: string }).store_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    rider: riderGate.rider,
    delivery: stripDeliveryProofStorageFromClientRow(del as Record<string, unknown>),
    order,
    store: storeRow ?? null,
  });
}

function safeTrim(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

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

  let action: Parameters<typeof riderPatchStoreOrderDelivery>[1]["action"];
  if (body.action === "accept") action = { type: "accept" };
  else if (body.action === "decline") action = { type: "decline", reason: body.reason ?? null };
  else if (body.action === "customer_arrived") action = { type: "customer_arrived" };
  else if (body.action === "set_delivery_status") {
    action = {
      type: "set_delivery_status",
      delivery_status: body.delivery_status,
      pod: body.pod ?? undefined,
    };
  } else if (body.action === "report_delivery_failure") {
    action = {
      type: "report_delivery_failure",
      reason: body.reason,
      note: body.note ?? null,
      failure_proof_image_path: body.failure_proof_image_path ?? null,
      failure_proof_image_url: body.failure_proof_image_url ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
    };
  } else {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }

  const result = await riderPatchStoreOrderDelivery(sb, {
    orderId: oid,
    riderUserId: userId,
    ip: rm.ip,
    user_agent: rm.userAgent,
    action,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  return NextResponse.json({
    ok: true,
    delivery: stripDeliveryProofStorageFromClientRow(result.row as unknown as Record<string, unknown>),
    previous_status: result.previous_status,
  });
}
