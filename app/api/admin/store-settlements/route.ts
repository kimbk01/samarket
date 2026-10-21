import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RETIRED (FIN-07) — legacy `store_settlements` per-order snapshot list (stopped 2026-09-15).
 *
 * Buyers pay the store directly, so these snapshots are store-collected money and never a payout
 * obligation. Admin settlement numbers come from the commission SSOT SQL (same as Owner):
 *   GET /api/admin/store-commission-ledger (+ /payable for the legacy reference rows)
 * No UI consumer (grep 2026-10-20). Doc: docs/store-commission-cash-settlement-ssot.md
 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    { ok: false, error: "legacy_store_settlements_retired", next: "/api/admin/store-commission-ledger" },
    { status: 410 }
  );
}
