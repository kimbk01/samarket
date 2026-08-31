/**
 * Stage 1 — Store Cash AD_SPEND / AD_REFUND writers (service_role RPC only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_STORE_CASH_SPENDS_TABLE,
  STORE_CASH_DELIVERY_AD_REFUND_RPC,
  STORE_CASH_DELIVERY_AD_SPEND_RPC,
  parseInsufficientStoreCashRpc,
  resolveFundingStatusFromStoreCashSpend,
  type InsufficientStoreCashPayload,
} from "@/lib/stores/advertising/delivery-ad-store-cash-contract";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export type SecureDeliveryAdStoreCashResult =
  | {
      ok: true;
      idempotent: boolean;
      spendId: string;
      spendLedgerId: string;
      amountPhp: number;
      amountMinor: number;
      balanceAfterPhp?: number;
    }
  | { ok: false; error: string; insufficient?: InsufficientStoreCashPayload; detail?: string };

export type RefundDeliveryAdStoreCashResult =
  | {
      ok: true;
      idempotent: boolean;
      spendId: string;
      refundLedgerId: string | null;
      amountPhp: number;
      balanceAfterPhp?: number;
    }
  | { ok: false; error: string; detail?: string };

export async function debitStoreCashForDeliveryAd(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    campaignId: string;
    productKind: "store_sponsored" | "banner";
  }
): Promise<SecureDeliveryAdStoreCashResult> {
  const { data, error } = await sb.rpc(STORE_CASH_DELIVERY_AD_SPEND_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_campaign_id: input.campaignId,
    p_product_kind: input.productKind,
  });

  if (error) {
    return { ok: false, error: "rpc_failed", detail: error.message };
  }
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const insufficient = parseInsufficientStoreCashRpc(payload);
    if (insufficient) {
      return { ok: false, error: "INSUFFICIENT_STORE_CASH", insufficient };
    }
    return {
      ok: false,
      error: typeof payload?.error === "string" ? payload.error : "debit_failed",
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }

  return {
    ok: true,
    idempotent: payload.idempotent === true,
    spendId: String(payload.spend_id ?? ""),
    spendLedgerId: String(payload.spend_ledger_id ?? ""),
    amountPhp: Math.trunc(Number(payload.amount_php) || 0),
    amountMinor: Math.trunc(Number(payload.amount_minor) || 0),
    balanceAfterPhp:
      payload.balance_after_php == null
        ? undefined
        : Math.trunc(Number(payload.balance_after_php) || 0),
  };
}

export async function refundStoreCashForRejectedDeliveryAd(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    campaignId: string;
    productKind: "store_sponsored" | "banner";
  }
): Promise<RefundDeliveryAdStoreCashResult> {
  const { data, error } = await sb.rpc(STORE_CASH_DELIVERY_AD_REFUND_RPC, {
    p_admin_user_id: input.adminUserId,
    p_campaign_id: input.campaignId,
    p_product_kind: input.productKind,
  });

  if (error) {
    return { ok: false, error: "rpc_failed", detail: error.message };
  }
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      error: typeof payload?.error === "string" ? payload.error : "refund_failed",
      detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    };
  }

  return {
    ok: true,
    idempotent: payload.idempotent === true,
    spendId: String(payload.spend_id ?? ""),
    refundLedgerId:
      payload.refund_ledger_id == null ? null : String(payload.refund_ledger_id),
    amountPhp: Math.trunc(Number(payload.amount_php) || 0),
    balanceAfterPhp:
      payload.balance_after_php == null
        ? undefined
        : Math.trunc(Number(payload.balance_after_php) || 0),
  };
}

export async function loadDeliveryAdStoreCashSpendStatusByCampaignIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner";
    campaignIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  const out = new Map<string, DeliveryAdFundingStatus>();
  const ids = [...new Set(input.campaignIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) return out;

  try {
    const { data, error } = await sb
      .from(DELIVERY_AD_STORE_CASH_SPENDS_TABLE)
      .select("campaign_id, status")
      .eq("product_kind", input.productKind)
      .in("campaign_id", ids);
    if (error) {
      if (/delivery_ad_store_cash_spends|schema cache|does not exist/i.test(String(error.message))) {
        return out;
      }
      console.error("[loadDeliveryAdStoreCashSpendStatusByCampaignIds]", error.message);
      return out;
    }
    for (const row of (data ?? []) as Array<{ campaign_id?: string; status?: string }>) {
      const cid = String(row.campaign_id ?? "").trim();
      if (!cid) continue;
      out.set(cid, resolveFundingStatusFromStoreCashSpend(row.status));
    }
  } catch (e) {
    console.error(
      "[loadDeliveryAdStoreCashSpendStatusByCampaignIds]",
      e instanceof Error ? e.message : e
    );
  }
  return out;
}

export async function loadCampaignStoreCashSpendRow(
  sb: SupabaseClient,
  input: { productKind: "store_sponsored" | "banner"; campaignId: string }
): Promise<{
  status: DeliveryAdFundingStatus;
  amountPhp: number | null;
  spendLedgerId: string | null;
  refundLedgerId: string | null;
} | null> {
  const { data, error } = await sb
    .from(DELIVERY_AD_STORE_CASH_SPENDS_TABLE)
    .select("status, amount_php, spend_ledger_id, refund_ledger_id")
    .eq("product_kind", input.productKind)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = data as Record<string, unknown>;
  return {
    status: resolveFundingStatusFromStoreCashSpend(String(raw.status ?? "")),
    amountPhp: raw.amount_php == null ? null : Math.trunc(Number(raw.amount_php) || 0),
    spendLedgerId: raw.spend_ledger_id == null ? null : String(raw.spend_ledger_id),
    refundLedgerId: raw.refund_ledger_id == null ? null : String(raw.refund_ledger_id),
  };
}

const STORE_CASH_ACCOUNTS_TABLE = "store_cash_accounts" as const;
const STORES_TABLE = "stores" as const;

/**
 * Stage 1 ads payment wallet = Store Cash (`balance` PHP major).
 * UI still formats via minor (×100) for existing `formatDeliveryAdPhpMinor`.
 */
export async function loadOwnerStoreCashBalanceForAds(
  sb: SupabaseClient,
  input: { ownerUserId: string; storeIds?: readonly string[] | null }
): Promise<{
  balancePhp: number;
  balanceMinor: number;
  currency: "PHP";
  authority: "STORE_CASH";
  storeCount: number;
}> {
  const ownerUserId = String(input.ownerUserId ?? "").trim();
  let storeIds = [...new Set((input.storeIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!storeIds.length && ownerUserId) {
    const { data: stores, error: storesErr } = await sb
      .from(STORES_TABLE)
      .select("id")
      .eq("owner_user_id", ownerUserId);
    if (storesErr) {
      console.error("[loadOwnerStoreCashBalanceForAds] stores", storesErr.message);
      return {
        balancePhp: 0,
        balanceMinor: 0,
        currency: "PHP",
        authority: "STORE_CASH",
        storeCount: 0,
      };
    }
    storeIds = (stores ?? []).map((r) => String((r as { id?: string }).id ?? "").trim()).filter(Boolean);
  }
  if (!storeIds.length) {
    return {
      balancePhp: 0,
      balanceMinor: 0,
      currency: "PHP",
      authority: "STORE_CASH",
      storeCount: 0,
    };
  }

  const { data, error } = await sb
    .from(STORE_CASH_ACCOUNTS_TABLE)
    .select("store_id, balance")
    .in("store_id", storeIds);
  if (error) {
    console.error("[loadOwnerStoreCashBalanceForAds]", error.message);
    return {
      balancePhp: 0,
      balanceMinor: 0,
      currency: "PHP",
      authority: "STORE_CASH",
      storeCount: storeIds.length,
    };
  }

  let balancePhp = 0;
  for (const row of data ?? []) {
    balancePhp += Math.max(0, Math.trunc(Number((row as { balance?: number }).balance ?? 0) || 0));
  }
  return {
    balancePhp,
    balanceMinor: balancePhp * 100,
    currency: "PHP",
    authority: "STORE_CASH",
    storeCount: storeIds.length,
  };
}

export async function loadStoreCashBalanceForStore(
  sb: SupabaseClient,
  storeId: string
): Promise<{ balancePhp: number; balanceMinor: number; currency: "PHP"; authority: "STORE_CASH" }> {
  const sid = String(storeId ?? "").trim();
  if (!sid) {
    return { balancePhp: 0, balanceMinor: 0, currency: "PHP", authority: "STORE_CASH" };
  }
  const { data, error } = await sb
    .from(STORE_CASH_ACCOUNTS_TABLE)
    .select("balance")
    .eq("store_id", sid)
    .maybeSingle();
  if (error) {
    console.error("[loadStoreCashBalanceForStore]", error.message);
    return { balancePhp: 0, balanceMinor: 0, currency: "PHP", authority: "STORE_CASH" };
  }
  const balancePhp = Math.max(0, Math.trunc(Number((data as { balance?: number } | null)?.balance ?? 0) || 0));
  return {
    balancePhp,
    balanceMinor: balancePhp * 100,
    currency: "PHP",
    authority: "STORE_CASH",
  };
}
