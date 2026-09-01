/**
 * P0-C — Owner application commercial binding helpers.
 * Server recomputes quotes; client payable is never authority.
 * Draft package binding uses pricing_model = `pkg:<uuid>` (no P0-A schema change).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertCampaignCommercialSnapshot,
  prepareOwnerPaidCampaignSnapshotFromQuote,
  quoteDeliveryAdApplicationCommercial,
} from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

export const OWNER_AD_PACKAGE_PRICING_MODEL_PREFIX = "pkg:" as const;

/** Banner creative pending Admin production — not an Owner-uploaded asset. */
export const OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET =
  "delivery-ads/pending/admin-production" as const;

/** Canonical 39:16 placeholder dimensions for Admin-produced banner requests. */
export const OWNER_BANNER_PENDING_SOURCE_WIDTH = 390;
export const OWNER_BANNER_PENDING_SOURCE_HEIGHT = 160;

export function encodeOwnerAdPackagePricingModel(packageId: string): string {
  return `${OWNER_AD_PACKAGE_PRICING_MODEL_PREFIX}${packageId.trim()}`;
}

export function decodeOwnerAdPackagePricingModel(
  pricingModel: string | null | undefined
): string | null {
  if (typeof pricingModel !== "string") return null;
  if (!pricingModel.startsWith(OWNER_AD_PACKAGE_PRICING_MODEL_PREFIX)) return null;
  const id = pricingModel.slice(OWNER_AD_PACKAGE_PRICING_MODEL_PREFIX.length).trim();
  return id || null;
}

/** Provisional schedule from package duration — Admin publish may shift actual start. */
export function scheduleWindowFromPackageDurationDays(
  durationDays: number,
  nowMs = Date.now()
): { ok: true; startAtIso: string; endAtIso: string } | { ok: false; error: "invalid_duration" } {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    return { ok: false, error: "invalid_duration" };
  }
  const startMs = nowMs + 60_000;
  const endMs = startMs + durationDays * 86_400_000;
  return {
    ok: true,
    startAtIso: new Date(startMs).toISOString(),
    endAtIso: new Date(endMs).toISOString(),
  };
}

export type OwnerCommercialAttachResult =
  | { ok: true; finalPayableMinor: number; currency: string; packageId: string }
  | {
      ok: false;
      error:
        | "package_required"
        | "quote_unavailable"
        | "quote_stale"
        | "commercial_snapshot_failed"
        | string;
      quoteError?: string;
    };

/**
 * Recompute quote + persist immutable snapshot before SUBMITTED transition.
 * Rejects when clientFinalPayableMinor disagrees with server quote.
 */
export async function attachOwnerPaidCommercialSnapshotOnSubmit(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    storeId: string;
    productKind: DeliveryAdProductKey;
    inventoryKey: string;
    packageId: string;
    clientFinalPayableMinor?: number | null;
  }
): Promise<OwnerCommercialAttachResult> {
  const packageId = String(input.packageId ?? "").trim();
  if (!packageId) return { ok: false, error: "package_required" };

  const quote = await quoteDeliveryAdApplicationCommercial(sb, {
    productKind: input.productKind,
    inventoryKey: input.inventoryKey,
    packageId,
    storeId: input.storeId,
    clientFinalPayableMinor:
      input.clientFinalPayableMinor == null ? undefined : input.clientFinalPayableMinor,
  });

  if (!quote.ok) {
    return {
      ok: false,
      error: "quote_unavailable",
      quoteError: quote.error,
    };
  }

  if (
    input.clientFinalPayableMinor != null &&
    Number.isInteger(input.clientFinalPayableMinor) &&
    input.clientFinalPayableMinor !== quote.finalPayableMinor
  ) {
    return { ok: false, error: "quote_stale", quoteError: "client_payable_mismatch" };
  }

  const snapshot = prepareOwnerPaidCampaignSnapshotFromQuote({
    campaignId: input.campaignId,
    quote,
    clientFinalPayableMinor: input.clientFinalPayableMinor ?? undefined,
  });

  const inserted = await insertCampaignCommercialSnapshot(sb, snapshot);
  if (!inserted.ok) {
    // Resubmit / duplicate-submit: snapshot is unique per (campaign_id, product_kind).
    // Reuse the existing bound price when package + payable still match.
    const uniqueHit = /duplicate|unique|23505/i.test(inserted.error);
    if (uniqueHit) {
      const { data: existing, error: loadErr } = await sb
        .from(DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE)
        .select("package_id, final_payable_minor, currency")
        .eq("campaign_id", input.campaignId)
        .eq("product_kind", input.productKind)
        .maybeSingle();
      if (loadErr) {
        return { ok: false, error: "commercial_snapshot_failed", quoteError: loadErr.message };
      }
      const existingPackageId =
        existing && typeof (existing as { package_id?: unknown }).package_id === "string"
          ? String((existing as { package_id: string }).package_id)
          : "";
      const existingPayable = Math.trunc(
        Number((existing as { final_payable_minor?: unknown } | null)?.final_payable_minor ?? NaN)
      );
      if (
        existingPackageId === packageId &&
        Number.isFinite(existingPayable) &&
        existingPayable === quote.finalPayableMinor
      ) {
        return {
          ok: true,
          finalPayableMinor: quote.finalPayableMinor,
          currency: quote.currency,
          packageId,
        };
      }
      return {
        ok: false,
        error: "quote_stale",
        quoteError: "existing_snapshot_mismatch",
      };
    }
    return { ok: false, error: "commercial_snapshot_failed", quoteError: inserted.error };
  }

  return {
    ok: true,
    finalPayableMinor: quote.finalPayableMinor,
    currency: quote.currency,
    packageId,
  };
}
