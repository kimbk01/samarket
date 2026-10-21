import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/stores/[storeId]/gift-certificates/revenue — removed (GFT-06, G-1 §5-D).
 * It read the archive-only Store Cash wallet (store_cash_accounts / store_cash_ledger / recovery obligations),
 * which `docs/dibay-gift-certificate-hard-lock.md` forbids as an active reader. No product consumer
 * (Owner UI uses OwnerGiftMoneyOpsPanel → finance / redemptions / promo routes).
 */
export function GET() {
  return NextResponse.json(
    { ok: false, error: "owner_gift_revenue_route_removed_use_gift_finance" },
    { status: 410 }
  );
}
