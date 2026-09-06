/**
 * Admin Delivery Ad period extension — PAID | ADMIN_FREE_COMPENSATION.
 * Uses existing quote SSOT + business_cash spend + extension_snapshots.
 * No silent date-only paid exposure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_AD_CAMPAIGN_TABLE,
  STORE_SPONSORED_CAMPAIGN_TABLE,
} from "@/lib/stores/advertising/delivery-ad-domain";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import {
  calculateDeliveryAdExtensionQuote,
  DELIVERY_AD_EXTENSION_POLICY_TABLE,
  DELIVERY_AD_EXTENSION_SNAPSHOT_TABLE,
  DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES,
  DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE,
  type DeliveryAdExtensionKind,
  type DeliveryAdExtensionPolicyRow,
} from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { debitBusinessCashForDeliveryAd } from "@/lib/stores/advertising/canonical-business-cash-writer";
import type { AdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";

export type AdminDeliveryAdExtendKind = Extract<
  DeliveryAdExtensionKind,
  "PAID" | "ADMIN_FREE_COMPENSATION"
>;

export type AdminExtendDeliveryAdResult =
  | {
      ok: true;
      extensionKind: AdminDeliveryAdExtendKind;
      daysAdded: number;
      previousEndAt: string;
      newEndAt: string;
      amountMinor: number;
      currency: string;
      paymentStatus: "CHARGED" | "NOT_REQUIRED" | "FIRST_PARTY_NO_CHARGE";
      snapshotId: string;
      spendLedgerId: string | null;
    }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      detail?: string;
    };

function tableFor(product: AdminDeliveryAdProduct): string {
  return product === "banner" ? BANNER_AD_CAMPAIGN_TABLE : STORE_SPONSORED_CAMPAIGN_TABLE;
}

function mapPolicy(raw: Record<string, unknown> | null): DeliveryAdExtensionPolicyRow | null {
  if (!raw) return null;
  return {
    extensionEnabled: raw.extension_enabled === true,
    additionalDayPriceMinor:
      raw.additional_day_price_minor == null ? null : Number(raw.additional_day_price_minor),
    currency: String(raw.currency ?? "PHP"),
    minimumExtensionDays: Number(raw.minimum_extension_days ?? 1),
    maximumExtensionDays: Number(raw.maximum_extension_days ?? 30),
    extensionUnitDays: Number(raw.extension_unit_days ?? 1),
  };
}

async function partnerDiscountPercent(
  sb: SupabaseClient,
  storeId: string | null
): Promise<number> {
  if (!storeId) return 0;
  const { data } = await sb
    .from(DELIVERY_AD_PARTNER_MEMBERSHIP_TABLE)
    .select("advertising_discount_percent_snapshot, status")
    .eq("store_id", storeId)
    .in("status", [...DELIVERY_AD_PARTNER_DISCOUNT_ELIGIBLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return 0;
  return Number(
    (data as { advertising_discount_percent_snapshot?: number })
      .advertising_discount_percent_snapshot ?? 0
  );
}

/**
 * Extend campaign end_at with money/compensation semantics.
 * FREE silent policy path is NOT offered — only PAID or ADMIN_FREE_COMPENSATION (reason required).
 */
export async function adminExtendDeliveryAdCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: AdminDeliveryAdProduct;
    campaignId: string;
    expectedUpdatedAt: string;
    requestedDays: number;
    extensionKind: AdminDeliveryAdExtendKind;
    reason: string;
    idempotencyKey?: string | null;
  }
): Promise<AdminExtendDeliveryAdResult> {
  const adminUserId = input.adminUserId.trim();
  const reason = input.reason.trim();
  if (!adminUserId) return { ok: false, error: "missing_admin", httpStatus: 400 };
  if (!reason) return { ok: false, error: "reason_required", httpStatus: 400 };
  if (!Number.isInteger(input.requestedDays) || input.requestedDays < 1) {
    return { ok: false, error: "days_out_of_range", httpStatus: 400 };
  }

  const table = tableFor(input.productKind);
  const { data: row, error: loadErr } = await sb
    .from(table)
    .select(
      "id, lifecycle_status, start_at, end_at, updated_at, store_id, owner_user_id, campaign_source"
    )
    .eq("id", input.campaignId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: "db_error", httpStatus: 500, detail: loadErr.message };
  if (!row?.id) return { ok: false, error: "campaign_not_found", httpStatus: 404 };
  if (String((row as { updated_at?: string }).updated_at) !== input.expectedUpdatedAt) {
    return { ok: false, error: "stale_updated_at", httpStatus: 409 };
  }

  const life = String((row as { lifecycle_status?: string }).lifecycle_status ?? "");
  if (
    !(
      life === "ACTIVE" ||
      life === "SCHEDULED" ||
      life === "PAUSED_OWNER" ||
      life === "PAUSED_ADMIN" ||
      life === "APPROVED"
    )
  ) {
    return { ok: false, error: "not_extendable", httpStatus: 409 };
  }

  const previousEndAt = String((row as { end_at?: string }).end_at ?? "");
  if (!previousEndAt) return { ok: false, error: "invalid_end", httpStatus: 409 };

  const campaignSource =
    String((row as { campaign_source?: string }).campaign_source ?? "OWNER_PAID") ===
    "DIBAY_FIRST_PARTY"
      ? "DIBAY_FIRST_PARTY"
      : "OWNER_PAID";

  if (input.extensionKind === "PAID" && campaignSource === "DIBAY_FIRST_PARTY") {
    return {
      ok: false,
      error: "first_party_use_compensation",
      httpStatus: 422,
      detail: "First-party campaigns use ADMIN_FREE_COMPENSATION only.",
    };
  }

  const { data: policyRaw, error: policyErr } = await sb
    .from(DELIVERY_AD_EXTENSION_POLICY_TABLE)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (policyErr) {
    return { ok: false, error: "policy_unavailable", httpStatus: 503, detail: policyErr.message };
  }
  const policy = mapPolicy((policyRaw as Record<string, unknown> | null) ?? null);
  if (!policy) {
    return { ok: false, error: "policy_unavailable", httpStatus: 503 };
  }

  const storeId =
    (row as { store_id?: string | null }).store_id != null
      ? String((row as { store_id: string }).store_id)
      : null;
  const ownerUserId =
    (row as { owner_user_id?: string | null }).owner_user_id != null
      ? String((row as { owner_user_id: string }).owner_user_id)
      : null;

  const discount = await partnerDiscountPercent(sb, storeId);
  const quote = calculateDeliveryAdExtensionQuote({
    previousEndAtIso: previousEndAt,
    requestedDays: input.requestedDays,
    policy,
    partnerDiscountPercent: discount,
    extensionKind: input.extensionKind,
  });
  if (!quote.ok) {
    return { ok: false, error: quote.error, httpStatus: 422 };
  }

  let spendLedgerId: string | null = null;
  let paymentStatus: "CHARGED" | "NOT_REQUIRED" | "FIRST_PARTY_NO_CHARGE" = "NOT_REQUIRED";

  if (input.extensionKind === "PAID") {
    if (!ownerUserId || !storeId) {
      return { ok: false, error: "missing_owner_store", httpStatus: 409 };
    }
    if (quote.finalExtensionAmountMinor <= 0) {
      return { ok: false, error: "invalid_quote_amount", httpStatus: 422 };
    }
    const idem =
      (input.idempotencyKey ?? "").trim() ||
      `extend:${input.campaignId}:${quote.newEndAt}:${quote.daysAdded}`;
    const charged = await debitBusinessCashForDeliveryAd(sb, {
      ownerUserId,
      storeId,
      applicationId: idem,
      productKind: input.productKind,
      amountMinor: quote.finalExtensionAmountMinor,
    });
    if (!charged.ok) {
      return {
        ok: false,
        error: charged.error,
        httpStatus: charged.error === "INSUFFICIENT_BUSINESS_CASH" ? 402 : 500,
        detail: charged.detail,
      };
    }
    spendLedgerId = charged.spendLedgerId || null;
    paymentStatus = "CHARGED";
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from(table)
    .update({
      end_at: quote.newEndAt,
      updated_by_user_id: adminUserId,
      updated_at: now,
    })
    .eq("id", input.campaignId)
    .eq("updated_at", input.expectedUpdatedAt);
  if (updErr) {
    return { ok: false, error: "db_error", httpStatus: 500, detail: updErr.message };
  }

  const { data: snap, error: snapErr } = await sb
    .from(DELIVERY_AD_EXTENSION_SNAPSHOT_TABLE)
    .insert({
      campaign_id: input.campaignId,
      product_kind: input.productKind,
      extension_kind: input.extensionKind,
      days_added: quote.daysAdded,
      unit_price_minor_snapshot: quote.unitPriceMinorSnapshot,
      partner_discount_percent_snapshot: quote.partnerDiscountPercentSnapshot,
      final_extension_amount_minor: quote.finalExtensionAmountMinor,
      currency: quote.currency,
      previous_end_at: quote.previousEndAt,
      new_end_at: quote.newEndAt,
      actor_user_id: adminUserId,
      actor_type: "admin",
      reason,
    })
    .select("id")
    .maybeSingle();
  if (snapErr || !snap?.id) {
    return {
      ok: false,
      error: "snapshot_failed",
      httpStatus: 500,
      detail: snapErr?.message,
    };
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: input.productKind,
    campaign_id: input.campaignId,
    actor_type: "admin",
    actor_user_id: adminUserId,
    action: "extended",
    reason,
    before_json: {
      end_at: quote.previousEndAt,
      extension_kind: null,
    },
    after_json: {
      end_at: quote.newEndAt,
      extension_kind: input.extensionKind,
      days_added: quote.daysAdded,
      amount_minor: quote.finalExtensionAmountMinor,
      currency: quote.currency,
      payment_status: paymentStatus,
      spend_ledger_id: spendLedgerId,
      snapshot_id: String(snap.id),
    },
  });

  return {
    ok: true,
    extensionKind: input.extensionKind,
    daysAdded: quote.daysAdded,
    previousEndAt: quote.previousEndAt,
    newEndAt: quote.newEndAt,
    amountMinor: quote.finalExtensionAmountMinor,
    currency: quote.currency,
    paymentStatus,
    snapshotId: String(snap.id),
    spendLedgerId,
  };
}
