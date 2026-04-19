import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { verifyExternalDeliveryWebhookSecret } from "@/lib/payments/external-delivery-webhook-secret";
import { enforceWebhookRateLimit } from "@/lib/security/webhook-ip-rate-limit";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { mapExternalDeliveryPartnerStatus } from "@/lib/stores/external-delivery-partner-status-map";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WebhookBody = {
  provider?: string;
  /** 사마켓 내부 store_orders.id */
  order_id?: string;
  /** 파트너 측 배차·주문 ID */
  partner_order_id?: string;
  /** 파트너 상태 원문 (매핑 입력) */
  partner_status: string;
  /** 최초 등록: 내부 주문에 아직 partner id가 없을 때 저장 */
  register_partner_order_id?: string;
  raw?: Record<string, unknown>;
};

function shallowMetaMerge(
  prev: Record<string, unknown> | null,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(prev && typeof prev === "object" ? prev : {}), ...patch };
}

/**
 * 외부 배달 파트너 → 사마켓 주문 동기화
 * - 헤더 `x-external-delivery-webhook-secret` (env EXTERNAL_DELIVERY_WEBHOOK_SECRET)
 * - 본문: order_id(내부 UUID) 또는 (provider + partner_order_id)로 주문 조회
 */
export async function POST(req: NextRequest) {
  const rl = await enforceWebhookRateLimit(req, "external-delivery");
  if (!rl.ok) return rl.response;

  const rawText = await req.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawText) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!verifyExternalDeliveryWebhookSecret(req.headers.get("x-external-delivery-webhook-secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const provider = String(body.provider ?? "generic").trim() || "generic";
  const partnerStatus = String(body.partner_status ?? "").trim();
  if (!partnerStatus) {
    return NextResponse.json({ ok: false, error: "partner_status_required" }, { status: 400 });
  }

  const orderIdInput = String(body.order_id ?? "").trim();
  const partnerOrderId = String(body.partner_order_id ?? "").trim();
  const registerId = String(body.register_partner_order_id ?? "").trim();

  let orderId: string | null = null;
  if (orderIdInput && UUID_RE.test(orderIdInput)) {
    orderId = orderIdInput;
  } else if (partnerOrderId) {
    const { data: row } = await sb
      .from("store_orders")
      .select("id")
      .eq("external_delivery_provider", provider)
      .eq("external_delivery_order_id", partnerOrderId)
      .maybeSingle();
    orderId = (row?.id as string) ?? null;
  }

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_status, fulfillment_type, external_delivery_meta, external_delivery_order_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  const prevMeta =
    order.external_delivery_meta &&
    typeof order.external_delivery_meta === "object" &&
    !Array.isArray(order.external_delivery_meta)
      ? (order.external_delivery_meta as Record<string, unknown>)
      : {};

  const rm = getAuditRequestMeta(req);
  const nowIso = new Date().toISOString();

  const linkId = registerId || partnerOrderId || null;
  const externalPatch: Record<string, unknown> = {
    external_delivery_provider: provider,
    external_delivery_status: partnerStatus,
    external_delivery_updated_at: nowIso,
    external_delivery_meta: shallowMetaMerge(prevMeta, {
      last_webhook: {
        at: nowIso,
        partner_status: partnerStatus,
        ...(body.raw && typeof body.raw === "object" ? { raw: body.raw } : {}),
      },
    }),
  };

  if (linkId && !(order.external_delivery_order_id as string | null)) {
    externalPatch.external_delivery_order_id = linkId;
  }

  const { error: extErr } = await sb.from("store_orders").update(externalPatch).eq("id", orderId);
  if (extErr) {
    if (extErr.message?.includes("external_delivery") && extErr.message.includes("does not exist")) {
      return NextResponse.json(
        {
          ok: false,
          error: "schema_missing_external_delivery_columns",
          hint: "Apply migration 20260329100000_store_orders_external_delivery.sql",
        },
        { status: 503 }
      );
    }
    console.error("[external-delivery webhook] meta update", extErr);
    return NextResponse.json({ ok: false, error: extErr.message }, { status: 500 });
  }

  const current = order.order_status as string;
  const fulfillment = order.fulfillment_type as string;

  const mapped = mapExternalDeliveryPartnerStatus(
    provider,
    partnerStatus,
    current as StoreOrderStatus,
    fulfillment
  );

  if (mapped.kind === "skip") {
    return NextResponse.json({
      ok: true,
      order_id: orderId,
      external_updated: true,
      internal_transition: null,
      skip_reason: mapped.reason,
    });
  }

  const applied = await applyStoreOrderStatusTransition(sb, {
    orderId,
    nextStatus: mapped.target,
    audit: {
      actor_type: "system",
      actor_id: null,
      action: "store_order.external_delivery_webhook",
      ip: rm.ip,
      user_agent: rm.userAgent,
    },
  });

  if (!applied.ok) {
    if (applied.error === "invalid_transition") {
      return NextResponse.json({
        ok: true,
        order_id: orderId,
        external_updated: true,
        internal_transition: {
          attempted: mapped.target,
          applied: false,
          reason: "invalid_transition",
          current_internal: current,
        },
      });
    }
    return NextResponse.json(
      { ok: false, error: applied.error, order_id: orderId, external_updated: true },
      { status: applied.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    external_updated: true,
    internal_transition: {
      applied: applied.previous !== applied.order_status,
      previous: applied.previous,
      order_status: applied.order_status,
    },
  });
}
