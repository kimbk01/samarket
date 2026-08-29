/**
 * CUT H — Delivery Ads financial writers (service-role RPCs).
 * Production path fail-closed while billing disabled / pricing inactive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_BILLING_CURRENCY_DEFAULT,
  DELIVERY_AD_BILLING_PLATFORM,
  DELIVERY_AD_BILLING_POLICY_TABLE,
  DELIVERY_AD_ORDER_PERCENT_BASIS,
  DELIVERY_AD_PRICING_POLICY_TABLE,
  assertDeliveryAdMoneyMinor,
  buildChargeIdempotencyKey,
  buildRefundIdempotencyKey,
  computeOrderPercentChargeMinor,
  isAutomaticChargingAllowed,
} from "@/lib/stores/advertising/delivery-ad-billing-contract";
import type { DeliveryAdPricingModel } from "@/lib/stores/advertising/delivery-ad-lifecycle";

export const CUT_H_BILLING_AUTHORITY = {
  chargeRpc: "delivery_ad_reconcile_charge",
  refundRpc: "delivery_ad_reconcile_refund",
  productionBilling: DELIVERY_AD_BILLING_PLATFORM.status,
  automaticProductionCharging: "DISABLED" as const,
  executeGrant: "service_role_only",
} as const;

export type DeliveryAdBillingError =
  | "billing_disabled"
  | "pricing_not_configured"
  | "invalid_amount"
  | "unsupported_model"
  | "currency_mismatch"
  | "client_amount_forbidden"
  | "basis_not_configured"
  | "budget_exceeded"
  | "charge_not_found"
  | "db_error"
  | "rpc_failed";

export async function loadDeliveryAdBillingEnabled(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb
    .from(DELIVERY_AD_BILLING_POLICY_TABLE)
    .select("is_enabled")
    .eq("id", "default")
    .maybeSingle();
  return data?.is_enabled === true;
}

export async function loadActiveDeliveryAdPricingPolicy(
  sb: SupabaseClient,
  input: { productKind: "store_sponsored" | "banner"; pricingModel: DeliveryAdPricingModel }
): Promise<{
  id: string;
  unitAmountMinor: number | null;
  percentageBasisPoints: number | null;
  currency: string;
} | null> {
  const { data } = await sb
    .from(DELIVERY_AD_PRICING_POLICY_TABLE)
    .select("id, unit_amount_minor, percentage_basis_points, currency, is_active")
    .eq("product_kind", input.productKind)
    .eq("pricing_model", input.pricingModel)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data || data.is_active !== true) return null;
  return {
    id: String(data.id),
    unitAmountMinor:
      data.unit_amount_minor == null ? null : Number(data.unit_amount_minor),
    percentageBasisPoints:
      data.percentage_basis_points == null
        ? null
        : Number(data.percentage_basis_points),
    currency: String(data.currency ?? DELIVERY_AD_BILLING_CURRENCY_DEFAULT),
  };
}

/**
 * Server-calculated charge attempt. Client amount is never accepted.
 * When Production billing disabled → { charged: false, reason: billing_disabled }.
 */
export async function reconcileDeliveryAdChargeFromSource(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    productKind: "store_sponsored" | "banner";
    storeId: string | null;
    ownerUserId: string;
    pricingModel: DeliveryAdPricingModel;
    sourceEventType: "click" | "attribution";
    sourceEventId: string;
    orderId?: string | null;
    attributionId?: string | null;
    /** ORDER_PERCENT only — must be server-derived order amount. */
    orderAmountMinor?: number | null;
    currency?: string;
    /** Test/fixture override — Production loaders use DB. */
    fixturePricing?: {
      id: string;
      unitAmountMinor: number | null;
      percentageBasisPoints: number | null;
      currency: string;
    } | null;
    /** Test only: force billing enabled for fixture path. */
    fixtureBillingEnabled?: boolean;
  }
): Promise<{
  ok: boolean;
  charged?: boolean;
  deduped?: boolean;
  reason?: string;
  error?: DeliveryAdBillingError;
  id?: string | null;
}> {
  try {
    if (input.pricingModel === "FIXED_PERIOD") {
      return { ok: true, charged: false, reason: "fixed_period_deferred" };
    }

    if (!String(input.sourceEventId ?? "").trim()) {
      return { ok: false, error: "invalid_amount" };
    }

    const billingEnabled =
      input.fixtureBillingEnabled !== undefined
        ? input.fixtureBillingEnabled
        : await loadDeliveryAdBillingEnabled(sb);

    const pricing =
      input.fixturePricing !== undefined
        ? input.fixturePricing
        : await loadActiveDeliveryAdPricingPolicy(sb, {
            productKind: input.productKind,
            pricingModel: input.pricingModel,
          });

    if (
      !isAutomaticChargingAllowed({
        billingEnabled,
        pricingActive: pricing != null,
      })
    ) {
      return {
        ok: true,
        charged: false,
        reason: !billingEnabled ? "billing_disabled" : "pricing_not_configured",
      };
    }

    if (!pricing) {
      return { ok: true, charged: false, reason: "pricing_not_configured" };
    }

    const currency = input.currency ?? pricing.currency;
    if (currency !== pricing.currency) {
      return { ok: false, error: "currency_mismatch" };
    }

    let amountMinor: number;
    if (input.pricingModel === "CPC" || input.pricingModel === "CPA_ORDER") {
      if (!assertDeliveryAdMoneyMinor(pricing.unitAmountMinor)) {
        return { ok: false, error: "pricing_not_configured" };
      }
      amountMinor = pricing.unitAmountMinor;
    } else if (input.pricingModel === "ORDER_PERCENT") {
      if (DELIVERY_AD_ORDER_PERCENT_BASIS.status === "NOT_CONFIGURED") {
        // Fixture may still compute when orderAmount + basis points provided AND fixtureBillingEnabled
        if (input.fixtureBillingEnabled !== true) {
          return { ok: true, charged: false, reason: "basis_not_configured" };
        }
      }
      if (
        pricing.percentageBasisPoints == null ||
        input.orderAmountMinor == null
      ) {
        return { ok: false, error: "invalid_amount" };
      }
      const computed = computeOrderPercentChargeMinor({
        orderAmountMinor: input.orderAmountMinor,
        percentageBasisPoints: pricing.percentageBasisPoints,
        basisConfigured: true,
      });
      if (!computed.ok) return { ok: false, error: computed.error };
      amountMinor = computed.amountMinor;
    } else {
      return { ok: false, error: "unsupported_model" };
    }

    const idempotencyKey = buildChargeIdempotencyKey({
      campaignId: input.campaignId,
      pricingModel: input.pricingModel,
      sourceEventId: input.sourceEventId,
    });

    const { data, error } = await sb.rpc(CUT_H_BILLING_AUTHORITY.chargeRpc, {
      p_campaign_id: input.campaignId,
      p_product_kind: input.productKind,
      p_store_id: input.storeId,
      p_owner_user_id: input.ownerUserId,
      p_pricing_model: input.pricingModel,
      p_source_event_type: input.sourceEventType,
      p_source_event_id: input.sourceEventId,
      p_order_id: input.orderId ?? null,
      p_attribution_id: input.attributionId ?? null,
      p_amount_minor: amountMinor,
      p_currency: currency,
      p_pricing_policy_id: pricing.id,
      p_unit_amount_minor_snapshot: pricing.unitAmountMinor,
      p_percentage_basis_points_snapshot: pricing.percentageBasisPoints,
      p_occurred_at: new Date().toISOString(),
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error("[delivery-ad-charge]", error.message);
      return { ok: false, error: "rpc_failed" };
    }
    const payload = data as {
      ok?: boolean;
      charged?: boolean;
      deduped?: boolean;
      reason?: string;
      error?: string;
      id?: string;
    } | null;
    if (!payload?.ok) {
      if (payload?.error === "budget_exceeded") {
        return { ok: false, error: "budget_exceeded" };
      }
      return { ok: false, error: (payload?.error as DeliveryAdBillingError) || "db_error" };
    }
    return {
      ok: true,
      charged: payload.charged === true,
      deduped: payload.deduped === true,
      reason: payload.reason,
      id: payload.id ?? null,
    };
  } catch (e) {
    console.error("[delivery-ad-charge]", e instanceof Error ? e.message : e);
    return { ok: false, error: "rpc_failed" };
  }
}

export async function reconcileDeliveryAdRefundForCharge(
  sb: SupabaseClient,
  input: {
    originalChargeId: string;
    reasonCode: string;
    sourceEventId: string;
    amountMinor: number;
    fixtureBillingEnabled?: boolean;
  }
): Promise<{
  ok: boolean;
  refunded?: boolean;
  deduped?: boolean;
  reason?: string;
  error?: DeliveryAdBillingError;
  id?: string | null;
}> {
  try {
    if (!assertDeliveryAdMoneyMinor(input.amountMinor)) {
      return { ok: false, error: "invalid_amount" };
    }
    const billingEnabled =
      input.fixtureBillingEnabled !== undefined
        ? input.fixtureBillingEnabled
        : await loadDeliveryAdBillingEnabled(sb);
    if (!billingEnabled) {
      return { ok: true, refunded: false, reason: "billing_disabled" };
    }

    const idempotencyKey = buildRefundIdempotencyKey({
      originalChargeId: input.originalChargeId,
      sourceEventId: input.sourceEventId,
    });

    const { data, error } = await sb.rpc(CUT_H_BILLING_AUTHORITY.refundRpc, {
      p_original_charge_id: input.originalChargeId,
      p_reason_code: input.reasonCode,
      p_source_event_id: input.sourceEventId,
      p_amount_minor: input.amountMinor,
      p_idempotency_key: idempotencyKey,
      p_occurred_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: "rpc_failed" };
    const payload = data as {
      ok?: boolean;
      refunded?: boolean;
      deduped?: boolean;
      reason?: string;
      error?: string;
      id?: string;
    } | null;
    if (!payload?.ok) {
      return { ok: false, error: (payload?.error as DeliveryAdBillingError) || "db_error" };
    }
    return {
      ok: true,
      refunded: payload.refunded === true,
      deduped: payload.deduped === true,
      reason: payload.reason,
      id: payload.id ?? null,
    };
  } catch {
    return { ok: false, error: "rpc_failed" };
  }
}

/** Post-order billing hook — never throws to order path. */
export async function reconcileDeliveryAdChargeForOrderSafe(
  sb: SupabaseClient,
  input: {
    orderId: string;
    storeId: string;
    ownerUserId: string | null;
    attributionId: string | null;
    campaignId: string | null;
    productKind: "store_sponsored" | "banner" | null;
  }
): Promise<void> {
  try {
    if (!input.ownerUserId || !input.attributionId || !input.campaignId || !input.productKind) {
      return;
    }
    const result = await reconcileDeliveryAdChargeFromSource(sb, {
      campaignId: input.campaignId,
      productKind: input.productKind,
      storeId: input.storeId,
      ownerUserId: input.ownerUserId,
      pricingModel: "CPA_ORDER",
      sourceEventType: "attribution",
      sourceEventId: input.attributionId,
      orderId: input.orderId,
      attributionId: input.attributionId,
    });
    if (!result.ok) {
      console.error("[delivery-ad-charge-order]", result.error);
    }
  } catch (e) {
    console.error("[delivery-ad-charge-order]", e instanceof Error ? e.message : e);
  }
}
