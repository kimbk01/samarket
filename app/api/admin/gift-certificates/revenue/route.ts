import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/gift-certificates/revenue
 * Platform-wide gift money snapshot from redemption rows + outstanding instances.
 */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = gate.sb;

  const [{ data: redemptions, error: rErr }, { data: instances, error: iErr }, { data: cashRows }] =
    await Promise.all([
      sb
        .from(GIFT_TABLES.redemptions)
        .select("redeemed_amount, platform_fee_amount, merchant_net_amount, reversed")
        .limit(5000),
      sb
        .from(GIFT_TABLES.instances)
        .select("remaining_balance, status")
        .in("status", ["ACTIVE", "PARTIALLY_REDEEMED", "GIFT_LOCKED"])
        .limit(5000),
      sb.from(GIFT_TABLES.storeCashAccounts).select("balance").limit(5000),
    ]);

  if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
  if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });

  let redeemedGross = 0;
  let platformFee = 0;
  let merchantNet = 0;
  for (const row of redemptions ?? []) {
    if ((row as { reversed?: boolean }).reversed === true) continue;
    redeemedGross += Math.max(0, Math.trunc(Number((row as { redeemed_amount?: number }).redeemed_amount) || 0));
    platformFee += Math.max(
      0,
      Math.trunc(Number((row as { platform_fee_amount?: number }).platform_fee_amount) || 0)
    );
    merchantNet += Math.max(
      0,
      Math.trunc(Number((row as { merchant_net_amount?: number }).merchant_net_amount) || 0)
    );
  }
  const outstandingGiftValue = (instances ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { remaining_balance?: number }).remaining_balance) || 0)),
    0
  );
  const storeCashTotal = (cashRows ?? []).reduce(
    (s, r) => s + Math.max(0, Math.trunc(Number((r as { balance?: number }).balance) || 0)),
    0
  );

  return NextResponse.json({
    ok: true,
    redeemedGross,
    platformFee,
    merchantNet,
    outstandingGiftValue,
    storeCashTotal,
  });
}
