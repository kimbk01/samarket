import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

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
  // AD-04: 정산 화면 권한 키(business) — 접근표 `/admin/store-settlements` · PATCH 와 같은 가드.
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { ok: false, error: "legacy_store_settlements_retired", next: "/api/admin/store-commission-ledger" },
    { status: 410 }
  );
}
