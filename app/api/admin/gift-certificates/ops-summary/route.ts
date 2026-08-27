import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  aggregateGiftRevenuePendingRecognized,
  isRedemptionRecognizedFromLedger,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/ops-summary — STORE / PLATFORM / FINANCIAL KPIs. */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const range = (new URL(req.url).searchParams.get("range") ?? "all").trim().toLowerCase();
  const sinceMs =
    range === "today"
      ? Date.now() - 24 * 60 * 60 * 1000
      : range === "7d"
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : range === "30d"
          ? Date.now() - 30 * 24 * 60 * 60 * 1000
          : null;
  const sinceIso = sinceMs != null ? new Date(sinceMs).toISOString() : null;

  let productsQ = sb
    .from(GIFT_TABLES.products)
    .select("id, active, gift_scope")
    .eq("active", true)
    .is("archived_at", null);
  let instancesQ = sb
    .from(GIFT_TABLES.instances)
    .select("id, remaining_balance, status, created_at, gift_scope");
  let redemptionsQ = sb
    .from(GIFT_TABLES.redemptions)
    .select("id, redeemed_amount, platform_fee_amount, merchant_net_amount, reversed, created_at, instance_id")
    .limit(5000);
  if (sinceIso) {
    productsQ = productsQ.gte("created_at", sinceIso);
    instancesQ = instancesQ.gte("created_at", sinceIso);
    redemptionsQ = redemptionsQ.gte("created_at", sinceIso);
  }

  const [
    { data: products, error: pErr },
    { data: instances, error: iErr },
    { data: redemptions, error: rErr },
    { data: cashOuts },
    { data: conversions },
    { data: recovery },
    { data: ledgerRows, error: lErr },
  ] = await Promise.all([
    productsQ.limit(5000),
    instancesQ.limit(5000),
    redemptionsQ,
    sb
      .from(GIFT_TABLES.cashOutRequests)
      .select("id, status")
      .in("status", ["REQUESTED", "APPROVED"])
      .limit(500),
    sb
      .from(GIFT_TABLES.conversionRequests)
      .select("id, status")
      .eq("status", "REQUESTED")
      .limit(500),
    sb
      .from(GIFT_TABLES.storeCashRecoveryObligations)
      .select("id, amount_remaining, status")
      .in("status", ["OPEN", "PARTIALLY_CLEARED"])
      .limit(500),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount")
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(20000),
  ]);

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });

  const scopeOf = (raw: unknown): "STORE" | "PLATFORM" =>
    String(raw ?? "") === "PLATFORM" ? "PLATFORM" : "STORE";

  let storeActiveProducts = 0;
  let platformActiveProducts = 0;
  for (const raw of products ?? []) {
    const r = raw as { gift_scope?: string };
    if (scopeOf(r.gift_scope) === "PLATFORM") platformActiveProducts += 1;
    else storeActiveProducts += 1;
  }

  const instanceScopeById = new Map<string, "STORE" | "PLATFORM">();
  let storeIssued = 0;
  let platformIssued = 0;
  let storeOutstanding = 0;
  let platformOutstanding = 0;
  let giftLocked = 0;
  let instanceCount = 0;
  for (const raw of instances ?? []) {
    const r = raw as { id?: string; remaining_balance?: number; status?: string; gift_scope?: string };
    const id = String(r.id ?? "");
    const sc = scopeOf(r.gift_scope);
    if (id) instanceScopeById.set(id, sc);
    instanceCount += 1;
    if (sc === "PLATFORM") platformIssued += 1;
    else storeIssued += 1;
    const st = String(r.status ?? "");
    if (st === "GIFT_LOCKED") giftLocked += 1;
    if (st === "ACTIVE" || st === "PARTIALLY_REDEEMED" || st === "GIFT_LOCKED") {
      const bal = Math.max(0, Math.trunc(Number(r.remaining_balance) || 0));
      if (sc === "PLATFORM") platformOutstanding += bal;
      else storeOutstanding += bal;
    }
  }

  const ledgerByRedemption = new Map<string, Array<{ entry_type: string; amount: number }>>();
  for (const lr of ledgerRows ?? []) {
    const rid = String((lr as { redemption_id?: string }).redemption_id ?? "");
    if (!rid) continue;
    const list = ledgerByRedemption.get(rid) ?? [];
    list.push({
      entry_type: String((lr as { entry_type?: string }).entry_type ?? ""),
      amount: Math.trunc(Number((lr as { amount?: number }).amount) || 0),
    });
    ledgerByRedemption.set(rid, list);
  }

  let storeRedeemedGross = 0;
  let platformRedeemedGross = 0;
  const revRows = (redemptions ?? []).map((row) => {
    const r = row as {
      id: string;
      instance_id?: string;
      reversed?: boolean;
      redeemed_amount?: number;
      platform_fee_amount?: number;
      merchant_net_amount?: number;
    };
    const id = String(r.id);
    const gross = Math.trunc(Number(r.redeemed_amount) || 0);
    const sc = instanceScopeById.get(String(r.instance_id ?? "")) ?? "STORE";
    if (r.reversed !== true) {
      if (sc === "PLATFORM") platformRedeemedGross += gross;
      else storeRedeemedGross += gross;
    }
    return {
      reversed: r.reversed === true,
      recognized: isRedemptionRecognizedFromLedger(ledgerByRedemption.get(id) ?? []),
      redeemedAmount: gross,
      platformFeeAmount: Math.trunc(Number(r.platform_fee_amount) || 0),
      merchantNetAmount: Math.trunc(Number(r.merchant_net_amount) || 0),
    };
  });
  const split = aggregateGiftRevenuePendingRecognized(revRows);

  const outstanding = storeOutstanding + platformOutstanding;
  const redeemedGross = split.pendingGross + split.recognizedGross;
  const openRecoveryAmount = (recovery ?? []).reduce(
    (s, r) =>
      s + Math.max(0, Math.trunc(Number((r as { amount_remaining?: number }).amount_remaining) || 0)),
    0
  );

  return NextResponse.json({
    ok: true,
    range: range === "today" || range === "7d" || range === "30d" ? range : "all",
    activeProducts: storeActiveProducts + platformActiveProducts,
    issuedInstances: instanceCount,
    outstandingGiftValue: outstanding,
    giftLockedCount: giftLocked,
    redeemedGross,
    pendingGross: split.pendingGross,
    pendingPlatformFee: split.pendingPlatformFee,
    pendingMerchantNet: split.pendingMerchantNet,
    recognizedGross: split.recognizedGross,
    recognizedPlatformFee: split.recognizedPlatformFee,
    recognizedMerchantNet: split.recognizedMerchantNet,
    cashOutPendingCount: (cashOuts ?? []).length,
    storeCashConversionPendingCount: (conversions ?? []).length,
    openRecoveryCount: (recovery ?? []).length,
    openRecoveryAmount,
    storeGift: {
      activeProducts: storeActiveProducts,
      issuedInstances: storeIssued,
      outstanding: storeOutstanding,
      redeemedGross: storeRedeemedGross,
    },
    platformGift: {
      activeProducts: platformActiveProducts,
      issuedInstances: platformIssued,
      outstanding: platformOutstanding,
      redeemedGross: platformRedeemedGross,
    },
  });
}
