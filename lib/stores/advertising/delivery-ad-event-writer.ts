/**
 * CUT G — Delivery Ads event writers + order attribution reconcile.
 * Order commit must succeed even if attribution fails.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_ATTRIBUTION_POLICY,
  DELIVERY_AD_ATTRIBUTION_POLICY_TABLE,
  isDeliveryAdAttributionConfigured,
  type DeliveryAdEventDestinationType,
  type DeliveryAdEventProductKind,
} from "@/lib/stores/advertising/delivery-ad-event-contract";
import {
  hashDeliveryAdAttributionBridge,
  verifyDeliveryAdExposureToken,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";

export const CUT_G_EVENT_AUTHORITY = {
  impressionRpc: "delivery_ad_record_impression",
  clickRpc: "delivery_ad_record_click",
  attributionRpc: "delivery_ad_reconcile_order_attribution",
  billing: "NONE",
  executeGrant: "service_role_only",
} as const;

export type DeliveryAdEventWriteError =
  | "invalid_token"
  | "expired"
  | "preview_forbidden"
  | "tampered_fields"
  | "invalid_destination"
  | "invalid_payload"
  | "db_error"
  | "rpc_failed";

export async function loadDeliveryAdAttributionPolicy(sb: SupabaseClient): Promise<{
  model: string;
  clickWindowSeconds: number | null;
  impressionOnlyEnabled: boolean;
  isActive: boolean;
  configured: boolean;
}> {
  const { data } = await sb
    .from(DELIVERY_AD_ATTRIBUTION_POLICY_TABLE)
    .select("model, click_window_seconds, impression_only_enabled, is_active")
    .eq("id", "default")
    .maybeSingle();
  if (!data) {
    return {
      model: DELIVERY_AD_ATTRIBUTION_POLICY.model,
      clickWindowSeconds: null,
      impressionOnlyEnabled: false,
      isActive: false,
      configured: false,
    };
  }
  const clickWindowSeconds =
    data.click_window_seconds == null ? null : Number(data.click_window_seconds);
  const isActive = data.is_active === true;
  return {
    model: String(data.model ?? DELIVERY_AD_ATTRIBUTION_POLICY.model),
    clickWindowSeconds: Number.isFinite(clickWindowSeconds as number)
      ? (clickWindowSeconds as number)
      : null,
    impressionOnlyEnabled: data.impression_only_enabled === true,
    isActive,
    configured: isDeliveryAdAttributionConfigured({ isActive, clickWindowSeconds }),
  };
}

export async function recordDeliveryAdImpressionFromToken(
  sb: SupabaseClient,
  input: {
    exposureToken: string;
    eventId: string;
    viewerSessionHash: string;
    occurredAtIso?: string;
    requestId?: string | null;
    /** Client-claimed fields must match token or rejected. */
    claimed?: Partial<{
      campaignId: string;
      storeId: string;
      inventoryId: string;
      productKind: string;
    }>;
  }
): Promise<
  | { ok: true; id: string | null; deduped: boolean }
  | { ok: false; error: DeliveryAdEventWriteError; detail?: string }
> {
  const verified = verifyDeliveryAdExposureToken(input.exposureToken);
  if (!verified.ok) return { ok: false, error: verified.error };
  const p = verified.payload;
  if (p.preview) return { ok: false, error: "preview_forbidden" };

  if (input.claimed) {
    if (input.claimed.campaignId && input.claimed.campaignId !== p.campaignId) {
      return { ok: false, error: "tampered_fields" };
    }
    if (input.claimed.storeId && input.claimed.storeId !== p.storeId) {
      return { ok: false, error: "tampered_fields" };
    }
    if (input.claimed.inventoryId && input.claimed.inventoryId !== p.inventoryId) {
      return { ok: false, error: "tampered_fields" };
    }
    if (input.claimed.productKind && input.claimed.productKind !== p.productKind) {
      return { ok: false, error: "tampered_fields" };
    }
  }

  const { data, error } = await sb.rpc(CUT_G_EVENT_AUTHORITY.impressionRpc, {
    p_event_id: input.eventId,
    p_campaign_id: p.campaignId,
    p_product_kind: p.productKind,
    p_creative_id: p.creativeId,
    p_inventory_id: p.inventoryId,
    p_store_id: p.storeId,
    p_surface: p.surface,
    p_placement_index: p.placementIndex,
    p_viewer_session_hash: input.viewerSessionHash,
    p_render_instance_id: p.renderInstanceId,
    p_request_id: input.requestId ?? null,
    p_occurred_at: input.occurredAtIso ?? new Date().toISOString(),
    p_context_json: null,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = data as { ok?: boolean; error?: string; id?: string; deduped?: boolean } | null;
  if (!payload?.ok) {
    return { ok: false, error: (payload?.error as DeliveryAdEventWriteError) || "db_error" };
  }
  return { ok: true, id: payload.id ?? null, deduped: payload.deduped === true };
}

export async function recordDeliveryAdClickFromToken(
  sb: SupabaseClient,
  input: {
    exposureToken: string;
    eventId: string;
    viewerSessionHash: string;
    impressionEventId?: string | null;
    buyerUserId?: string | null;
    occurredAtIso?: string;
    claimedDestinationType?: string | null;
    claimedDestinationId?: string | null;
  }
): Promise<
  | { ok: true; id: string | null; deduped: boolean }
  | { ok: false; error: DeliveryAdEventWriteError; detail?: string }
> {
  const verified = verifyDeliveryAdExposureToken(input.exposureToken);
  if (!verified.ok) return { ok: false, error: verified.error };
  const p = verified.payload;
  if (p.preview) return { ok: false, error: "preview_forbidden" };
  if (!p.storeId) return { ok: false, error: "invalid_payload" };

  if (
    input.claimedDestinationType &&
    input.claimedDestinationType !== p.destinationType
  ) {
    return { ok: false, error: "invalid_destination" };
  }
  if (input.claimedDestinationId && input.claimedDestinationId !== p.destinationId) {
    return { ok: false, error: "invalid_destination" };
  }

  const bridge = input.buyerUserId
    ? hashDeliveryAdAttributionBridge(input.buyerUserId)
    : null;

  const { data, error } = await sb.rpc(CUT_G_EVENT_AUTHORITY.clickRpc, {
    p_event_id: input.eventId,
    p_impression_event_id: input.impressionEventId ?? null,
    p_campaign_id: p.campaignId,
    p_product_kind: p.productKind,
    p_creative_id: p.creativeId,
    p_inventory_id: p.inventoryId,
    p_store_id: p.storeId,
    p_surface: p.surface,
    p_placement_index: p.placementIndex,
    p_viewer_session_hash: input.viewerSessionHash,
    p_destination_type: p.destinationType,
    p_destination_id: p.destinationId,
    p_attribution_bridge_key: bridge,
    p_occurred_at: input.occurredAtIso ?? new Date().toISOString(),
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = data as { ok?: boolean; error?: string; id?: string; deduped?: boolean } | null;
  if (!payload?.ok) {
    return { ok: false, error: (payload?.error as DeliveryAdEventWriteError) || "db_error" };
  }
  return { ok: true, id: payload.id ?? null, deduped: payload.deduped === true };
}

/**
 * Post-order-commit attribution. Never throws to caller for order rollback —
 * returns failure for logging/retry.
 */
export async function reconcileDeliveryAdAttributionForOrder(
  sb: SupabaseClient,
  input: {
    orderId: string;
    storeId: string;
    buyerUserId: string;
    orderCommittedAtIso?: string;
  }
): Promise<{
  ok: boolean;
  attributed?: boolean;
  deduped?: boolean;
  reason?: string;
  error?: string;
}> {
  try {
    const bridge = hashDeliveryAdAttributionBridge(input.buyerUserId);
    const { data, error } = await sb.rpc(CUT_G_EVENT_AUTHORITY.attributionRpc, {
      p_order_id: input.orderId,
      p_store_id: input.storeId,
      p_attribution_bridge_key: bridge,
      p_order_committed_at: input.orderCommittedAtIso ?? new Date().toISOString(),
    });
    if (error) {
      console.error("[delivery-ad-attribution]", error.message);
      return { ok: false, error: error.message };
    }
    const payload = data as {
      ok?: boolean;
      attributed?: boolean;
      deduped?: boolean;
      reason?: string;
      error?: string;
    } | null;
    if (!payload?.ok) {
      return { ok: false, error: payload?.error || "attribution_failed" };
    }
    return {
      ok: true,
      attributed: payload.attributed === true,
      deduped: payload.deduped === true,
      reason: payload.reason,
    };
  } catch (e) {
    console.error("[delivery-ad-attribution]", e instanceof Error ? e.message : e);
    return { ok: false, error: "attribution_exception" };
  }
}

export type { DeliveryAdEventDestinationType, DeliveryAdEventProductKind };
