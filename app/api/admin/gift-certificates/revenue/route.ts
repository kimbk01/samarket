import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  aggregateGiftRevenuePendingRecognized,
  isRedemptionRecognizedFromLedger,
} from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/gift-certificates/revenue
 * Platform-wide gift money snapshot — pending vs recognized fee split.
 */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const [
    { data: redemptions, error: rErr },
    { data: instances, error: iErr },
    { data: cashRows },
    { data: ledgerRows, error: lErr },
  ] = await Promise.all([
    sb
      .from(GIFT_TABLES.redemptions)
      .select("id, redeemed_amount, platform_fee_amount, merchant_net_amount, reversed")
      .limit(5000),
    sb
      .from(GIFT_TABLES.instances)
      .select("remaining_balance, status")
      .in("status", ["ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED"])
      .limit(5000),
    sb.from(GIFT_TABLES.storeCashAccounts).select("balance").limit(5000),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount")
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(20000),
  ]);

  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });

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

  const rows = (redemptions ?? []).map((row) => {
    const r = row as {
      id: string;
      reversed?: boolean;
      redeemed_amount?: number;
      platform_fee_amount?: number;
      merchant_net_amount?: number;
    };
    const id = String(r.id);
    return {
      reversed: r.reversed === true,
      recognized: isRedemptionRecognizedFromLedger(ledgerByRedemption.get(id) ?? []),
      redeemedAmount: Math.trunc(Number(r.redeemed_amount) || 0),
      platformFeeAmount: Math.trunc(Number(r.platform_fee_amount) || 0),
      merchantNetAmount: Math.trunc(Number(r.merchant_net_amount) || 0),
    };
  });

  const split = aggregateGiftRevenuePendingRecognized(rows);

  const outstandingGiftValue = (instances ?? []).reduce(
    (s, r) =>
      s + Math.max(0, Math.trunc(Number((r as { remaining_balance?: number }).remaining_balance) || 0)),
    0
  );
  const storeCashTotal = (cashRows ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { balance?: number }).balance) || 0)),
    0
  );

  return NextResponse.json({
    ok: true,
    redeemedGross: split.pendingGross + split.recognizedGross,
    platformFee: split.recognizedPlatformFee,
    merchantNet: split.recognizedMerchantNet,
    pendingGross: split.pendingGross,
    pendingPlatformFee: split.pendingPlatformFee,
    pendingMerchantNet: split.pendingMerchantNet,
    recognizedGross: split.recognizedGross,
    recognizedPlatformFee: split.recognizedPlatformFee,
    recognizedMerchantNet: split.recognizedMerchantNet,
    outstandingGiftValue,
    storeCashTotal,
  });
}
