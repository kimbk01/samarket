import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadOrderMoneyChain } from "@/lib/finance/order-money-chain/load-order-money-chain";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";
import { loadAdFundingTraces } from "@/lib/finance/ad-funding-trace/load-ad-funding-trace";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/stores/[storeId]/finance/transparent
 * Shared SSOT read models scoped to owner store.
 * ?kind=statement|order-chain|ad-funding
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") || "statement").trim();

  if (kind === "order-chain") {
    const orderId = url.searchParams.get("orderId")?.trim() ?? "";
    if (!orderId) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
    const chain = await loadOrderMoneyChain(sb, { orderId, forOwnerStoreId: sid });
    if (!chain) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, chain });
  }

  if (kind === "ad-funding") {
    const traces = await loadAdFundingTraces(sb, {
      storeId: sid,
      fundingRail: "STORE_CASH",
      limit: Math.trunc(Number(url.searchParams.get("limit") || 40)),
    });
    return NextResponse.json({ ok: true, traces });
  }

  const period = resolveStoreFinancialPeriod({
    period: url.searchParams.get("period"),
    fromDay: url.searchParams.get("fromDay"),
    toDay: url.searchParams.get("toDay"),
  });
  const statement = await loadStoreStatement(sb, {
    storeId: sid,
    fromIso: period.fromIso,
    toIso: period.toIso,
  });
  if (!statement) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, statement, period });
}
