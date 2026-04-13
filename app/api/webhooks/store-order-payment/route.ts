import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { verifyStoreOrderPaymentWebhookSecret } from "@/lib/payments/store-order-webhook-secret";
import { enforceWebhookRateLimit } from "@/lib/security/webhook-ip-rate-limit";
import { appendStorePaymentEvent } from "@/lib/stores/append-store-payment-event";
import {
  recordStoreOrderPaid,
  recordStoreOrderPaymentFailed,
} from "@/lib/stores/record-store-order-payment";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * 범용 JSON 웹훅: 헤더 `x-store-payment-webhook-secret` 검증 후 결제 성공/실패 반영
 */
export async function POST(req: NextRequest) {
  const rl = await enforceWebhookRateLimit(req, "store-order-payment");
  if (!rl.ok) return rl.response;

  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const genericSecretOk = verifyStoreOrderPaymentWebhookSecret(
    req.headers.get("x-store-payment-webhook-secret")
  );
  if (!genericSecretOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const event = String(body.event ?? "").trim();
  const orderId = String(body.order_id ?? "").trim();
  const provider = String(body.provider ?? "generic").trim() || "generic";
  const providerPaymentId = String(body.provider_payment_id ?? "").trim();

  if (event === "payment.failed") {
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "order_id_and_event_required" }, { status: 400 });
    }
    await appendStorePaymentEvent(sb, {
      source: "webhook_generic",
      order_id: orderId,
      event_type: "payment.failed",
      provider,
      payload: body,
    });
    const r = await recordStoreOrderPaymentFailed(sb, { orderId });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: r.httpStatus });
    }
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "store_order",
      target_id: orderId,
      action: "payment.webhook.generic_failed",
      after_json: { payment_status: "failed", provider },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
    return NextResponse.json({ ok: true, payment_status: "failed" });
  }

  if (event !== "payment.succeeded") {
    return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
  }

  if (!orderId || !providerPaymentId) {
    return NextResponse.json({ ok: false, error: "order_id_and_event_required" }, { status: 400 });
  }

  const amount =
    body.amount != null && Number.isFinite(Number(body.amount)) ? Number(body.amount) : undefined;

  await appendStorePaymentEvent(sb, {
    source: "webhook_generic",
    order_id: orderId,
    event_type: "payment.succeeded",
    provider,
    payload: body,
  });

  const r = await recordStoreOrderPaid(sb, {
    orderId,
    provider,
    providerPaymentId,
    amountFromGateway: amount,
    meta: { webhook: true, raw: body.raw ?? body },
  });

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error, hint: r.hint },
      { status: r.httpStatus }
    );
  }

  const rm2 = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "store_order",
    target_id: orderId,
    action: "payment.webhook.generic_succeeded",
    after_json: {
      payment_status: r.payment_status,
      already: r.already ?? false,
      reconciled: r.reconciled ?? false,
      provider,
    },
    ip: rm2.ip,
    user_agent: rm2.userAgent,
  });

  return NextResponse.json({
    ok: true,
    payment_status: r.payment_status,
    already: r.already ?? false,
    reconciled: r.reconciled ?? false,
  });
}
