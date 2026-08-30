/**
 * Owner Business Cash funding writers — service-role RPC only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_BUSINESS_CASH_CREDIT_RPC,
  ADMIN_REFUND_DELIVERY_AD_FUNDING_RPC,
  DELIVERY_AD_CAMPAIGN_FUNDINGS_TABLE,
  OWNER_FUND_DELIVERY_AD_CAMPAIGN_RPC,
  buildAdminCashCreditIdempotencyKey,
  buildAdminFundingRefundIdempotencyKey,
  buildOwnerFundIdempotencyKey,
} from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { DELIVERY_AD_ACCOUNT_TABLE } from "@/lib/stores/advertising/delivery-ad-billing-contract";

const ACCOUNT_TABLE = DELIVERY_AD_ACCOUNT_TABLE;

export async function loadOwnerBusinessCashBalance(
  sb: SupabaseClient,
  ownerUserId: string,
  currency = "PHP"
): Promise<{ balanceMinor: number; currency: string } | null> {
  const { data, error } = await sb
    .from(ACCOUNT_TABLE)
    .select("balance_minor, currency")
    .eq("owner_user_id", ownerUserId)
    .eq("currency", currency)
    .maybeSingle();
  if (error) {
    if (/balance_minor|column/i.test(String(error.message))) {
      return { balanceMinor: 0, currency };
    }
    return null;
  }
  if (!data) return { balanceMinor: 0, currency };
  return {
    balanceMinor: Number((data as { balance_minor?: number }).balance_minor ?? 0),
    currency: String((data as { currency?: string }).currency ?? currency),
  };
}

export async function loadCampaignFundingRow(
  sb: SupabaseClient,
  input: { productKind: "store_sponsored" | "banner"; campaignId: string }
): Promise<{
  fundingStatus: "FUNDED" | "REFUNDED" | "UNFUNDED";
  amountMinor: number | null;
  currency: string | null;
  fundedAt: string | null;
  ledgerTransactionId: string | null;
} | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_CAMPAIGN_FUNDINGS_TABLE)
    .select("funding_status, amount_minor, currency, funded_at, ledger_transaction_id")
    .eq("product_kind", input.productKind)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (error) {
    if (/delivery_ad_campaign_fundings|schema cache|does not exist/i.test(String(error.message))) {
      return {
        fundingStatus: "UNFUNDED",
        amountMinor: null,
        currency: null,
        fundedAt: null,
        ledgerTransactionId: null,
      };
    }
    return null;
  }
  if (!data) {
    return {
      fundingStatus: "UNFUNDED",
      amountMinor: null,
      currency: null,
      fundedAt: null,
      ledgerTransactionId: null,
    };
  }
  const status = String((data as { funding_status?: string }).funding_status ?? "");
  return {
    fundingStatus: status === "FUNDED" || status === "REFUNDED" ? status : "UNFUNDED",
    amountMinor:
      (data as { amount_minor?: number | null }).amount_minor == null
        ? null
        : Number((data as { amount_minor: number }).amount_minor),
    currency: (data as { currency?: string | null }).currency ?? null,
    fundedAt: (data as { funded_at?: string | null }).funded_at ?? null,
    ledgerTransactionId:
      (data as { ledger_transaction_id?: string | null }).ledger_transaction_id ?? null,
  };
}

export async function ownerFundDeliveryAdCampaign(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    productKind: "store_sponsored" | "banner";
    campaignId: string;
    idempotencyKey?: string;
  }
): Promise<
  | {
      ok: true;
      fundingStatus: string;
      amountMinor: number;
      currency: string;
      balanceMinor: number | null;
      idempotent: boolean;
    }
  | { ok: false; error: string; detail?: string; balanceMinor?: number; requiredMinor?: number }
> {
  const idem =
    input.idempotencyKey?.trim() ||
    buildOwnerFundIdempotencyKey({
      ownerUserId: input.ownerUserId,
      productKind: input.productKind,
      campaignId: input.campaignId,
    });
  const { data, error } = await sb.rpc(OWNER_FUND_DELIVERY_AD_CAMPAIGN_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_product_kind: input.productKind,
    p_campaign_id: input.campaignId,
    p_idempotency_key: idem,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: String(payload?.error ?? "rpc_failed"),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
      balanceMinor:
        typeof payload?.balance_minor === "number" ? payload.balance_minor : undefined,
      requiredMinor:
        typeof payload?.required_minor === "number" ? payload.required_minor : undefined,
    };
  }
  return {
    ok: true,
    fundingStatus: String(payload.funding_status ?? "FUNDED"),
    amountMinor: Number(payload.amount_minor ?? 0),
    currency: String(payload.currency ?? "PHP"),
    balanceMinor: typeof payload.balance_minor === "number" ? payload.balance_minor : null,
    idempotent: payload.idempotent === true,
  };
}

export async function adminCreditBusinessCash(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    ownerUserId: string;
    amountMinor: number;
    currency?: string;
    reason: string;
    nonce: string;
  }
): Promise<
  | { ok: true; balanceMinor: number; currency: string; idempotent: boolean }
  | { ok: false; error: string; detail?: string }
> {
  const idem = buildAdminCashCreditIdempotencyKey({
    adminUserId: input.adminUserId,
    ownerUserId: input.ownerUserId,
    amountMinor: input.amountMinor,
    nonce: input.nonce,
  });
  const { data, error } = await sb.rpc(ADMIN_BUSINESS_CASH_CREDIT_RPC, {
    p_admin_user_id: input.adminUserId,
    p_owner_user_id: input.ownerUserId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency ?? "PHP",
    p_reason: input.reason,
    p_idempotency_key: idem,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: String(payload?.error ?? "rpc_failed"),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }
  return {
    ok: true,
    balanceMinor: Number(payload.balance_minor ?? 0),
    currency: String(payload.currency ?? "PHP"),
    idempotent: payload.idempotent === true,
  };
}

export async function adminRefundDeliveryAdFunding(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    productKind: "store_sponsored" | "banner";
    campaignId: string;
    reason: string;
    fundingLedgerId: string;
  }
): Promise<{ ok: true; fundingStatus: string } | { ok: false; error: string; detail?: string }> {
  const idem = buildAdminFundingRefundIdempotencyKey({
    campaignId: input.campaignId,
    productKind: input.productKind,
    fundingLedgerId: input.fundingLedgerId,
  });
  const { data, error } = await sb.rpc(ADMIN_REFUND_DELIVERY_AD_FUNDING_RPC, {
    p_admin_user_id: input.adminUserId,
    p_product_kind: input.productKind,
    p_campaign_id: input.campaignId,
    p_reason: input.reason,
    p_idempotency_key: idem,
  });
  if (error) return { ok: false, error: "rpc_failed", detail: error.message };
  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: String(payload?.error ?? "rpc_failed"),
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }
  return { ok: true, fundingStatus: String(payload.funding_status ?? "REFUNDED") };
}
