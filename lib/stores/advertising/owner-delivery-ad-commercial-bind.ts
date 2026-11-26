/**
 * P0-C — Owner application commercial binding helpers.
 * Server recomputes quotes; client payable is never authority.
 * Draft package binding uses pricing_model = `pkg:<uuid>` (no P0-A schema change).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  prepareOwnerPaidCampaignSnapshotFromQuote,
  quoteDeliveryAdApplicationCommercial,
} from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { DeliveryAdCampaignCommercialSnapshot } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { hasCanonicalBcFundingSecured } from "@/lib/stores/advertising/canonical-business-cash-writer";

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
  | {
      ok: true;
      finalPayableMinor: number;
      currency: string;
      packageId: string;
      /**
       * C-DB SA-02: 저장할 요금 기록 — **여기서 저장하지 않는다.** 제출 DB 함수(`owner_submit_delivery_ad_with_business_cash_v2`)가
       * 차감·전이와 같은 트랜잭션에서 저장한다(차감 실패면 기록도 없음). 이미 확보된 캐시가 있으면 null(묶인 기록 그대로).
       */
      snapshot: DeliveryAdCampaignCommercialSnapshot | null;
    }
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
 * Recompute quote + prepare the snapshot for the atomic submit (C-DB SA-02 — no write here).
 * Rejects when clientFinalPayableMinor / clientDurationDays disagree with the server quote.
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
    /** R-69: 화면 견적에 보인 기간 — 지금 상품 기간과 다르면 quote_stale(차감 없음) */
    clientDurationDays?: number | null;
  }
): Promise<OwnerCommercialAttachResult> {
  const packageId = String(input.packageId ?? "").trim();
  if (!packageId) return { ok: false, error: "package_required" };

  /**
   * F-09 — Cash already SECURED against the bound snapshot (e.g. resubmit after a failed
   * transition). The bound price is authority; re-quoting could fail with quote_stale /
   * existing_snapshot_mismatch and strand the funding. Reuse the existing snapshot.
   */
  const fundingSecured = await hasCanonicalBcFundingSecured(sb, {
    productKind: input.productKind,
    applicationId: input.campaignId,
  });
  if (fundingSecured) {
    const { data: bound, error: boundErr } = await sb
      .from(DELIVERY_AD_CAMPAIGN_COMMERCIAL_SNAPSHOT_TABLE)
      .select("package_id, final_payable_minor, currency")
      .eq("campaign_id", input.campaignId)
      .eq("product_kind", input.productKind)
      .maybeSingle();
    if (boundErr) {
      return { ok: false, error: "commercial_snapshot_failed", quoteError: boundErr.message };
    }
    if (bound) {
      const b = bound as { package_id?: unknown; final_payable_minor?: unknown; currency?: unknown };
      const boundPayable = Math.trunc(Number(b.final_payable_minor ?? NaN));
      if (Number.isFinite(boundPayable)) {
        return {
          ok: true,
          finalPayableMinor: boundPayable,
          currency: typeof b.currency === "string" && b.currency ? b.currency : "PHP",
          packageId: typeof b.package_id === "string" && b.package_id ? b.package_id : packageId,
          snapshot: null,
        };
      }
    }
  }

  /**
   * R-73: 캐시가 아직 확보되지 않은 제출은 화면에 보인 금액·기간이 **필수** — 없으면 차감 전에 멈추고 새 요금 확인을 요구한다.
   * (예전: 보내지 않으면 대조를 건너뛰고 지금 견적으로 차감 → 상세 화면 「신청하기」가 화면 확인 없이 바뀐 가격·기간으로 결제)
   */
  if (
    input.clientFinalPayableMinor == null ||
    !Number.isInteger(input.clientFinalPayableMinor) ||
    input.clientDurationDays == null ||
    !Number.isInteger(input.clientDurationDays)
  ) {
    return { ok: false, error: "quote_stale", quoteError: "client_quote_required" };
  }

  let quote: Awaited<ReturnType<typeof quoteDeliveryAdApplicationCommercial>>;
  try {
    quote = await quoteDeliveryAdApplicationCommercial(sb, {
      productKind: input.productKind,
      inventoryKey: input.inventoryKey,
      packageId,
      storeId: input.storeId,
      clientFinalPayableMinor:
        input.clientFinalPayableMinor == null ? undefined : input.clientFinalPayableMinor,
    });
  } catch {
    /** R-70: 견적 조회 오류 = 「확인 못 함」(503) — 차감 전 */
    return { ok: false, error: "capacity_check_failed" };
  }

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
  /**
   * R-69: 기간도 대조 — 어드민이 (가격은 그대로) 기간만 바꾸면 화면 「7일」을 보고 3일로 결제되는 것을 막는다.
   * (회원 배너 연장 R-35 와 같은 방식)
   */
  if (
    input.clientDurationDays != null &&
    Number.isInteger(input.clientDurationDays) &&
    input.clientDurationDays !== quote.durationDays
  ) {
    return { ok: false, error: "quote_stale", quoteError: "client_duration_mismatch" };
  }

  const snapshot = prepareOwnerPaidCampaignSnapshotFromQuote({
    campaignId: input.campaignId,
    quote,
    clientFinalPayableMinor: input.clientFinalPayableMinor ?? undefined,
  });

  return {
    ok: true,
    finalPayableMinor: quote.finalPayableMinor,
    currency: quote.currency,
    packageId,
    snapshot,
  };
}
