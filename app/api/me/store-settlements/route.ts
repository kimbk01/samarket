import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RETIRED (FIN-07) — legacy `store_settlements` per-order snapshots (stopped 2026-09-15).
 *
 * Buyers pay the store directly, so these snapshots are store-collected money and never a payout
 * obligation. Owner settlement numbers come from the commission SSOT SQL (same as Admin):
 *   GET /api/me/stores/{storeId}/commission-ledger
 * No UI consumer (grep 2026-10-20). Doc: docs/store-commission-cash-settlement-ssot.md
 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { ok: false, error: "legacy_store_settlements_retired", next: "/api/me/stores/{storeId}/commission-ledger" },
    { status: 410 }
  );
}
