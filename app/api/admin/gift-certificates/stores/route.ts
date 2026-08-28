import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adminGiftProfileLabel,
  loadAdminGiftProfileMap,
} from "@/lib/gift-certificate/admin-gift-ops-profile";
import {
  aggregateGiftRevenuePendingRecognized,
  isRedemptionRecognizedFromLedger,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

async function storeMoneySnapshot(sb: SupabaseClient, storeId: string) {
  const [
    { data: avail },
    { data: cash },
    { data: recoveryRows },
    { data: cashOuts },
    { data: conversions },
    { data: redemptions },
    { data: ledgerRows },
    { data: products },
    { data: instances },
  ] = await Promise.all([
    sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId }),
    sb.from(GIFT_TABLES.storeCashAccounts).select("balance").eq("store_id", storeId).maybeSingle(),
    sb
      .from(GIFT_TABLES.storeCashRecoveryObligations)
      .select("amount_remaining, status")
      .eq("store_id", storeId)
      .in("status", ["OPEN", "PARTIALLY_CLEARED"])
      .limit(100),
    sb
      .from(GIFT_TABLES.cashOutRequests)
      .select("amount, status")
      .eq("store_id", storeId)
      .limit(200),
    sb
      .from(GIFT_TABLES.conversionRequests)
      .select("amount, status")
      .eq("store_id", storeId)
      .limit(200),
    sb
      .from(GIFT_TABLES.redemptions)
      .select("id, redeemed_amount, platform_fee_amount, merchant_net_amount, reversed")
      .eq("store_id", storeId)
      .limit(2000),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount")
      .eq("store_id", storeId)
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(10000),
    sb
      .from(GIFT_TABLES.products)
      .select("id, active")
      .eq("store_id", storeId)
      .limit(200),
    sb
      .from(GIFT_TABLES.instances)
      .select("id, remaining_balance, status")
      .eq("store_id", storeId)
      .limit(2000),
  ]);

  const ledgerByRedemption = new Map<string, Array<{ entry_type: string; amount: number }>>();
  for (const lr of ledgerRows ?? []) {
    const rid = s((lr as { redemption_id?: string }).redemption_id);
    if (!rid) continue;
    const list = ledgerByRedemption.get(rid) ?? [];
    list.push({
      entry_type: s((lr as { entry_type?: string }).entry_type),
      amount: n((lr as { amount?: number }).amount),
    });
    ledgerByRedemption.set(rid, list);
  }

  const revRows = ((redemptions ?? []) as Record<string, unknown>[]).map((r) => {
    const id = s(r.id);
    return {
      reversed: r.reversed === true,
      recognized: isRedemptionRecognizedFromLedger(ledgerByRedemption.get(id) ?? []),
      redeemedAmount: n(r.redeemed_amount),
      platformFeeAmount: n(r.platform_fee_amount),
      merchantNetAmount: n(r.merchant_net_amount),
    };
  });
  const split = aggregateGiftRevenuePendingRecognized(revRows);

  let cashOutHold = 0;
  let cashOutRequested = 0;
  let cashOutPaid = 0;
  for (const raw of cashOuts ?? []) {
    const r = raw as { amount?: number; status?: string };
    const amt = n(r.amount);
    const st = s(r.status).toUpperCase();
    if (st === "REQUESTED") cashOutRequested += amt;
    else if (st === "APPROVED") cashOutHold += amt;
    else if (st === "PAID") cashOutPaid += amt;
  }

  let conversionPending = 0;
  let conversionConverted = 0;
  for (const raw of conversions ?? []) {
    const r = raw as { amount?: number; status?: string };
    const amt = n(r.amount);
    const st = s(r.status).toUpperCase();
    if (st === "REQUESTED") conversionPending += amt;
    else if (st === "APPROVED" || st === "COMPLETED") conversionConverted += amt;
  }

  const openRecovery = ((recoveryRows ?? []) as Record<string, unknown>[]).reduce(
    (sum, r) => sum + Math.max(0, n(r.amount_remaining)),
    0
  );

  let outstanding = 0;
  let issued = 0;
  for (const raw of instances ?? []) {
    const r = raw as { remaining_balance?: number; status?: string };
    issued += 1;
    const st = s(r.status);
    if (st === "ACTIVE" || st === "PARTIALLY_REDEEMED" || st === "GIFT_LOCKED") {
      outstanding += Math.max(0, n(r.remaining_balance));
    }
  }

  const availableRevenue =
    typeof avail === "number" ? Math.trunc(avail) : Math.trunc(Number(avail) || 0);

  return {
    availableRevenue,
    storeCashBalance: cash ? n((cash as { balance?: number }).balance) : 0,
    openRecoveryAmount: openRecovery,
    pendingMerchantNet: split.pendingMerchantNet,
    recognizedMerchantNet: split.recognizedMerchantNet,
    redeemedGross: split.pendingGross + split.recognizedGross,
    pendingGross: split.pendingGross,
    recognizedGross: split.recognizedGross,
    cashOutHold,
    cashOutRequested,
    cashOutPaid,
    storeCashConversionPending: conversionPending,
    storeCashConverted: conversionConverted,
    outstandingBalance: outstanding,
    issuedInstances: issued,
    activeProducts: ((products ?? []) as { active?: boolean }[]).filter((p) => p.active === true)
      .length,
  };
}

/** GET /api/admin/gift-certificates/stores — store settlement rollup + optional detail parity.
 *  `purpose=issuance` — Admin Gift create picker: all Admin-eligible stores (not gift-product-derived).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const storeId = s(url.searchParams.get("storeId"));
  const purpose = s(url.searchParams.get("purpose")).toLowerCase();
  const q = s(url.searchParams.get("q"));

  /** Issuance picker — must NOT reuse settlement list (stores that already have gift products). */
  if (purpose === "issuance") {
    const selectAttempts = [
      "id, store_name, owner_user_id, approval_status, is_visible, business_type",
    ] as const;
    let rows: Record<string, unknown>[] = [];
    let lastErr: string | null = null;
    for (const sel of selectAttempts) {
      const { data, error } = await sb
        .from("stores")
        .select(sel)
        .order("store_name", { ascending: true })
        .limit(400);
      if (!error) {
        rows = ((data ?? []) as unknown as Record<string, unknown>[]);
        lastErr = null;
        break;
      }
      lastErr = error.message;
    }
    if (lastErr) {
      return NextResponse.json({ ok: false, error: lastErr }, { status: 500 });
    }

    rows = rows.filter((r) => {
      const st = s(r.approval_status);
      return st === "approved" || st === "suspended" || (q.length > 0 && st === "under_review");
    });

    if (q) {
      const ql = q.toLowerCase();
      rows = rows.filter((r) => {
        const name = s(r.store_name).toLowerCase();
        const id = s(r.id).toLowerCase();
        return name.includes(ql) || id.includes(ql) || id.startsWith(ql);
      });
    }

    const ownerIds = rows.map((r) => s(r.owner_user_id)).filter(Boolean);
    const profiles = await loadAdminGiftProfileMap(sb, ownerIds);
    return NextResponse.json({
      ok: true,
      purpose: "issuance",
      stores: rows.slice(0, 50).map((r) => ({
        storeId: s(r.id),
        storeName: s(r.store_name),
        ownerUserId: s(r.owner_user_id),
        ownerLabel: adminGiftProfileLabel(profiles.get(s(r.owner_user_id))),
        approvalStatus: s(r.approval_status),
        isVisible: r.is_visible === true,
        businessType: s(r.business_type),
        categoryName: "",
      })),
    });
  }

  if (storeId) {
    const { data: store, error } = await sb
      .from("stores")
      .select("id, store_name, owner_user_id")
      .eq("id", storeId)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!store) return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });

    const money = await storeMoneySnapshot(sb, storeId);
    const ownerId = s((store as { owner_user_id?: string }).owner_user_id);
    const profiles = await loadAdminGiftProfileMap(sb, [ownerId]);
    const adminValue = {
      recognizedMerchantNet: money.recognizedMerchantNet,
      availableRevenue: money.availableRevenue,
      cashOutHold: money.cashOutHold,
      cashOutPaid: money.cashOutPaid,
      conversionPending: money.storeCashConversionPending,
      converted: money.storeCashConverted,
      storeCash: money.storeCashBalance,
      recovery: money.openRecoveryAmount,
    };
    // Same RPC + same rollups — Owner UI uses available/storeCash/recovery from same sources.
    const ownerValue = {
      recognizedMerchantNet: money.recognizedMerchantNet,
      availableRevenue: money.availableRevenue,
      cashOutHold: money.cashOutHold,
      cashOutPaid: money.cashOutPaid,
      conversionPending: money.storeCashConversionPending,
      converted: money.storeCashConverted,
      storeCash: money.storeCashBalance,
      recovery: money.openRecoveryAmount,
    };
    const parityOk =
      adminValue.availableRevenue === ownerValue.availableRevenue &&
      adminValue.storeCash === ownerValue.storeCash &&
      adminValue.recovery === ownerValue.recovery &&
      adminValue.recognizedMerchantNet === ownerValue.recognizedMerchantNet;

    return NextResponse.json({
      ok: true,
      store: {
        storeId,
        storeName: s((store as { store_name?: string }).store_name),
        ownerUserId: ownerId,
        ownerLabel: adminGiftProfileLabel(profiles.get(ownerId)),
        ...money,
        adminValue,
        ownerValue,
        parityOk,
      },
    });
  }

  const { data: productStores, error: pErr } = await sb
    .from(GIFT_TABLES.products)
    .select("store_id")
    .limit(2000);
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  const storeIds = [
    ...new Set(
      ((productStores ?? []) as { store_id?: string }[])
        .map((r) => s(r.store_id))
        .filter(Boolean)
    ),
  ].slice(0, 100);

  if (!storeIds.length) {
    return NextResponse.json({ ok: true, stores: [] });
  }

  const { data: stores } = await sb
    .from("stores")
    .select("id, store_name, owner_user_id")
    .in("id", storeIds);
  const ownerIds = ((stores ?? []) as Record<string, unknown>[]).map((r) => s(r.owner_user_id));
  const profiles = await loadAdminGiftProfileMap(sb, ownerIds);
  const storeNameById = new Map(
    ((stores ?? []) as Record<string, unknown>[]).map((r) => [
      s(r.id),
      { name: s(r.store_name), owner: s(r.owner_user_id) },
    ])
  );

  const out = [];
  for (const sid of storeIds) {
    const meta = storeNameById.get(sid) ?? { name: "", owner: "" };
    const money = await storeMoneySnapshot(sb, sid);
    out.push({
      storeId: sid,
      storeName: meta.name,
      ownerUserId: meta.owner,
      ownerLabel: adminGiftProfileLabel(profiles.get(meta.owner)),
      ...money,
    });
  }

  return NextResponse.json({ ok: true, stores: out });
}
