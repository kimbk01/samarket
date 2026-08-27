import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  aggregateGiftRevenuePendingRecognized,
  isRedemptionRecognizedFromLedger,
  resolveGiftRedemptionRecognitionState,
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

/**
 * GET /api/admin/gift-certificates/revenue
 * Platform-wide gift money snapshot — pending vs recognized fee split.
 * ?detail=1 adds row-level redemption revenue trace.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;
  const wantDetail = new URL(req.url).searchParams.get("detail") === "1";

  const [
    { data: redemptions, error: rErr },
    { data: instances, error: iErr },
    { data: cashRows },
    { data: ledgerRows, error: lErr },
  ] = await Promise.all([
    sb
      .from(GIFT_TABLES.redemptions)
      .select(
        "id, order_id, instance_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from(GIFT_TABLES.instances)
      .select("id, public_gift_number, remaining_balance, status, gift_scope")
      .in("status", ["ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED"])
      .limit(5000),
    sb.from(GIFT_TABLES.storeCashAccounts).select("balance").limit(5000),
    sb
      .from(GIFT_TABLES.revenueLedger)
      .select("redemption_id, entry_type, amount, created_at")
      .in("entry_type", ["REVENUE_AVAILABLE", "RECOGNITION_CORRECTION", "REVERSED"])
      .limit(20000),
  ]);

  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });

  const ledgerByRedemption = new Map<
    string,
    Array<{ entry_type: string; amount: number; created_at: string }>
  >();
  for (const lr of ledgerRows ?? []) {
    const rid = s((lr as { redemption_id?: string }).redemption_id);
    if (!rid) continue;
    const list = ledgerByRedemption.get(rid) ?? [];
    list.push({
      entry_type: s((lr as { entry_type?: string }).entry_type),
      amount: n((lr as { amount?: number }).amount),
      created_at: s((lr as { created_at?: string }).created_at),
    });
    ledgerByRedemption.set(rid, list);
  }

  const redemptionRows = (redemptions ?? []) as Record<string, unknown>[];
  const rows = redemptionRows.map((r) => {
    const id = s(r.id);
    return {
      reversed: r.reversed === true,
      recognized: isRedemptionRecognizedFromLedger(ledgerByRedemption.get(id) ?? []),
      redeemedAmount: n(r.redeemed_amount),
      platformFeeAmount: n(r.platform_fee_amount),
      merchantNetAmount: n(r.merchant_net_amount),
    };
  });

  const split = aggregateGiftRevenuePendingRecognized(rows);

  const outstandingGiftValue = (instances ?? []).reduce(
    (sum, r) =>
      sum + Math.max(0, n((r as { remaining_balance?: number }).remaining_balance)),
    0
  );
  const storeCashTotal = (cashRows ?? []).reduce(
    (sum, r) => sum + Math.max(0, n((r as { balance?: number }).balance)),
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

  const instanceById = new Map(
    ((instances ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );
  // Load remaining instances referenced by redemptions but not in outstanding set
  const missingInst = [
    ...new Set(
      redemptionRows
        .map((r) => s(r.instance_id))
        .filter((id) => id && !instanceById.has(id))
    ),
  ].slice(0, 500);
  if (missingInst.length) {
    const { data: more } = await sb
      .from(GIFT_TABLES.instances)
      .select("id, public_gift_number, gift_scope")
      .in("id", missingInst);
    for (const r of (more ?? []) as Record<string, unknown>[]) {
      instanceById.set(s(r.id), r);
    }
  }

  const storeIds = [...new Set(redemptionRows.map((r) => s(r.store_id)).filter(Boolean))];
  const orderIds = [...new Set(redemptionRows.map((r) => s(r.order_id)).filter(Boolean))];
  const [{ data: stores }, { data: orders }] = await Promise.all([
    storeIds.length
      ? sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? sb.from("store_orders").select("id, order_no, order_status").in("id", orderIds)
      : Promise.resolve({ data: [] }),
  ]);
  const storeNameById = new Map(
    ((stores ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), s(r.store_name)])
  );
  const orderById = new Map(
    ((orders ?? []) as Record<string, unknown>[]).map((r) => [s(r.id), r])
  );

  const details = redemptionRows.slice(0, 500).map((r) => {
    const id = s(r.id);
    const ledger = ledgerByRedemption.get(id) ?? [];
    const recognized = isRedemptionRecognizedFromLedger(ledger);
    const reversed = r.reversed === true;
    const recognitionState = resolveGiftRedemptionRecognitionState({ reversed, recognized });
    const inst = instanceById.get(s(r.instance_id));
    const order = orderById.get(s(r.order_id));
    return {
      redemptionId: id,
      storeId: s(r.store_id),
      storeName: storeNameById.get(s(r.store_id)) ?? "",
      publicGiftNumber: s(inst?.public_gift_number),
      giftScope: s(inst?.gift_scope) === "PLATFORM" ? "PLATFORM" : "STORE",
      instanceId: s(r.instance_id),
      orderId: s(r.order_id),
      orderNo: s(order?.order_no) || null,
      orderStatus: s(order?.order_status) || null,
      gross: n(r.redeemed_amount),
      feeRate: n(r.platform_fee_rate_snapshot),
      platformFee: n(r.platform_fee_amount),
      merchantNet: n(r.merchant_net_amount),
      recognitionState,
      recognizedAt:
        recognitionState === "recognized"
          ? ledger.find((e) => e.entry_type === "REVENUE_AVAILABLE")?.created_at ?? null
          : null,
      usedAt: s(r.created_at),
    };
  });

  return NextResponse.json({ ...base, details });
}
