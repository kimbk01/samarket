import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  AST_004_STORE_POINTS_ECONOMIC,
  AST_005_BUSINESS_CASH,
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  buildOwnerConversionDisclosure,
  listBusinessCashLedgerForStore,
  listEconomicPointLedgerForStore,
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — canonical Store Finance (Coin + Cash) read surface. */
export async function GET(
  _req: NextRequest,
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

  const [bc, sp, quote, bcLedger, spLedger, charges, obligations] = await Promise.all([
    loadStoreBusinessCashBalance(sb, sid),
    loadStoreEconomicPointsBalance(sb, sid),
    buildOwnerConversionDisclosure(sb, { storeId: sid, requestedPoints: 0 }),
    listBusinessCashLedgerForStore(sb, sid),
    listEconomicPointLedgerForStore(sb, sid),
    sb
      .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
      .select("id, amount_minor, status, created_at, decided_at")
      .eq("store_id", sid)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("store_sale_fee_obligations")
      .select(
        "id, order_id, confirmed_revenue_php, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at"
      )
      .eq("store_id", sid)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const openObligations = obligations.error ? [] : obligations.data ?? [];
  const outstandingMinor = openObligations.reduce(
    (sum, row) => sum + Math.trunc(Number((row as { fee_outstanding_minor?: number }).fee_outstanding_minor) || 0),
    0
  );

  return NextResponse.json({
    ok: true,
    storeId: sid,
    assets: {
      storePoints: { assetId: AST_004_STORE_POINTS_ECONOMIC, balance: sp.balance },
      businessCash: {
        assetId: AST_005_BUSINESS_CASH,
        balanceMinor: bc.balanceMinor,
        currency: bc.currency,
      },
    },
    conversion: quote
      ? {
          ratePesosPerPoint: quote.ratePesosPerPoint,
          version: quote.version,
          isDefaultRate: quote.isDefaultRate,
          effectiveFrom: quote.effectiveFrom,
          rateChangedNoticeRequired: quote.rateChangedNoticeRequired,
        }
      : null,
    businessCashLedger: bcLedger,
    storePointsLedger: spLedger,
    saleFeeObligations: {
      outstandingMinor,
      openCount: openObligations.length,
      rows: openObligations.map((r) => ({
        id: String((r as { id: string }).id),
        orderId: String((r as { order_id?: string }).order_id ?? ""),
        confirmedRevenuePhp: Math.trunc(Number((r as { confirmed_revenue_php?: number }).confirmed_revenue_php) || 0),
        feeDueMinor: Math.trunc(Number((r as { fee_due_minor?: number }).fee_due_minor) || 0),
        feePaidMinor: Math.trunc(Number((r as { fee_paid_minor?: number }).fee_paid_minor) || 0),
        feeOutstandingMinor: Math.trunc(
          Number((r as { fee_outstanding_minor?: number }).fee_outstanding_minor) || 0
        ),
        status: String((r as { status?: string }).status ?? ""),
        createdAt: String((r as { created_at?: string }).created_at ?? ""),
      })),
    },
    topUpRequests: (charges.data ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      amountMinor: Math.trunc(Number((r as { amount_minor?: number }).amount_minor) || 0),
      status: String((r as { status?: string }).status ?? ""),
      createdAt: String((r as { created_at?: string }).created_at ?? ""),
      decidedAt:
        (r as { decided_at?: string | null }).decided_at == null
          ? null
          : String((r as { decided_at: string }).decided_at),
    })),
  });
}
