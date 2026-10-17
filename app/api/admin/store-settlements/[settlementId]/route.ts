import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RETIRED — per-order payout (scheduled → paid / held / processing).
 *
 * Buyers pay the store directly (COD / store GCash / bank transfer), so the platform owes no
 * per-order payout. Platform-held amounts (gift certificate, platform-funded coupon) are paid as
 * Coin automatically at completion. Commission is charged from Business Cash at 조리 시작.
 * Manual admin work is only the cancel/refund commission review:
 *   POST /api/admin/store-commission-ledger/adjustments
 * Doc: docs/store-commission-cash-settlement-ssot.md
 */
export async function PATCH() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    {
      ok: false,
      error: "settlement_payout_retired",
      next: "/api/admin/store-commission-ledger/adjustments",
    },
    { status: 410 }
  );
}
