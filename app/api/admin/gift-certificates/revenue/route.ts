import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminGiftLedgerRedemptions } from "@/lib/gift-certificate/admin-gift-ledger-loaders";
import { aggregateGiftRevenuePendingRecognized } from "@/lib/gift-certificate/gift-revenue-recognition";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number {
  return Math.trunc(Number(v) || 0);
}

/**
 * GET /api/admin/gift-certificates/revenue
 * Shared ledger authority for settlement — optional productId / instanceId filters.
 * ?detail=1 adds row-level redemption revenue trace.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const url = new URL(req.url);
  const wantDetail = url.searchParams.get("detail") === "1";
  const productId = s(url.searchParams.get("productId") ?? url.searchParams.get("product_id"));
  const instanceId = s(url.searchParams.get("instanceId") ?? url.searchParams.get("instance_id"));

  const ledger = await loadAdminGiftLedgerRedemptions(sb, {
    productId: productId || null,
    instanceId: instanceId || null,
    limit: 5000,
  });
  if (!ledger.ok) {
    return NextResponse.json({ ok: false, error: ledger.error }, { status: 500 });
  }

  const rows = ledger.redemptions.map((r) => ({
    reversed: r.reversed,
    recognized: r.recognitionState === "recognized",
    redeemedAmount: r.gross,
    platformFeeAmount: r.platformFee,
    merchantNetAmount: r.merchantNet,
  }));
  const split = aggregateGiftRevenuePendingRecognized(rows);

  let outstandingQuery = sb
    .from(GIFT_TABLES.instances)
    .select("remaining_balance")
    .in("status", ["ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED"])
    .limit(5000);
  if (instanceId) outstandingQuery = outstandingQuery.eq("id", instanceId);
  else if (productId) outstandingQuery = outstandingQuery.eq("product_id", productId);

  const [{ data: instances }, { data: cashRows }] = await Promise.all([
    outstandingQuery,
    productId || instanceId
      ? Promise.resolve({ data: [] as unknown[] })
      : sb.from(GIFT_TABLES.storeCashAccounts).select("balance").limit(5000),
  ]);

  const outstandingGiftValue = (instances ?? []).reduce(
    (sum, r) => sum + Math.max(0, n((r as { remaining_balance?: number }).remaining_balance)),
    0
  );
  const storeCashTotal = ((cashRows ?? []) as { balance?: number }[]).reduce(
    (sum: number, r) => sum + Math.max(0, n(r.balance)),
    0
  );

  const base = {
    ok: true as const,
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
  };

  if (!wantDetail) {
    return NextResponse.json(base);
  }

  const details = ledger.redemptions.slice(0, 500).map((r) => ({
    redemptionId: r.id,
    storeId: r.storeId,
    storeName: r.storeName,
    publicGiftNumber: r.publicGiftNumber,
    giftScope: r.giftScope,
    instanceId: r.instanceId,
    productId: r.productId,
    orderId: r.orderId,
    orderNo: r.orderNo,
    orderStatus: r.orderStatus,
    gross: r.gross,
    feeRate: r.feeRate,
    platformFee: r.platformFee,
    merchantNet: r.merchantNet,
    recognitionState: r.recognitionState,
    recognizedAt: r.recognizedAt,
    usedAt: r.usedAt,
  }));

  return NextResponse.json({ ...base, details });
}
