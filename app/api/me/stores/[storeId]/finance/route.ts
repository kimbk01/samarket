import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  AST_004_STORE_POINTS_ECONOMIC,
  AST_005_BUSINESS_CASH,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";
import { loadOpenSaleFeeTotalsFromCashPosition } from "@/lib/stores/owner-finance-recent-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — canonical Store Finance (Coin + Cash) read surface. */
/** 미납 수수료 목록 한 쪽 줄 수 — 쪽 이동은 `obligation_offset` (재감사 R6-b) */
const OBLIGATION_PAGE_SIZE = 20;

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

  const obligationOffset = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("obligation_offset") ?? "0")) || 0);
  // P-3 — 전환 미리보기(`conversion`)·충전 20건(`topUpRequests`)은 호출 3곳(재무 화면·상품권 패널·홈 카드)이
  // 쓰지 않아 조회·응답에서 뺐다. 전환 화면은 `/business-cash` 를 읽는다.
  const [bc, sp, obligations, obligationAggregate] = await Promise.all([
    loadStoreBusinessCashBalance(sb, sid),
    loadStoreEconomicPointsBalance(sb, sid),
    sb
      .from("store_sale_fee_obligations")
      .select(
        "id, order_id, confirmed_revenue_php, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, store_orders(order_no)",
        { count: "exact" }
      )
      .eq("store_id", sid)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(obligationOffset, obligationOffset + OBLIGATION_PAGE_SIZE - 1),
    // M-19 / FIN-11 — totals over ALL open obligations from SQL store_cash_position (list above stays capped at 20 rows).
    loadOpenSaleFeeTotalsFromCashPosition(sb, sid),
  ]);

  const openObligations = obligations.error ? [] : obligations.data ?? [];
  const outstandingMinor = obligationAggregate.ok
    ? obligationAggregate.outstandingMinor
    : openObligations.reduce(
        (sum, row) =>
          sum + Math.trunc(Number((row as { fee_outstanding_minor?: number }).fee_outstanding_minor) || 0),
        0
      );
  const openCount =
    obligationAggregate.ok && obligationAggregate.openCount != null
      ? obligationAggregate.openCount
      : openObligations.length;

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
    // Coin·Cash 내역·기간 합계 = `/finance/history` (기간·페이지 · 「최근 N건 기준」 폐지 · Owner 2026-11-03)
    saleFeeObligations: {
      outstandingMinor,
      openCount,
      totalsComplete: obligationAggregate.ok,
      /** 목록 쪽 — 전체 건수는 목록 조회의 정확한 건수(오류면 null) */
      listTotal: obligations.error ? null : obligations.count ?? openObligations.length,
      listOffset: obligationOffset,
      listPageSize: OBLIGATION_PAGE_SIZE,
      listError: Boolean(obligations.error),
      rows: openObligations.map((r) => ({
        id: String((r as { id: string }).id),
        orderId: String((r as { order_id?: string }).order_id ?? ""),
        orderNo: String((r as { store_orders?: { order_no?: string } | null }).store_orders?.order_no ?? ""),
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
  });
}
