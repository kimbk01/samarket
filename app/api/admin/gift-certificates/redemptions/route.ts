import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminGiftLedgerRedemptions } from "@/lib/gift-certificate/admin-gift-ledger-loaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/gift-certificates/redemptions — global usage list (shared ledger loader). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const result = await loadAdminGiftLedgerRedemptions(gate.sb, {
    filter: url.searchParams.get("filter") ?? "all",
    q: url.searchParams.get("q"),
    productId: url.searchParams.get("productId") ?? url.searchParams.get("product_id"),
    instanceId: url.searchParams.get("instanceId") ?? url.searchParams.get("instance_id"),
    limit: 300,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, redemptions: result.redemptions });
}
