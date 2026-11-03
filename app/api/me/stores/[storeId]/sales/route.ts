import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { loadStoreCommissionBreakdown } from "@/lib/stores/commission/load-store-commission-ledger";
import {
  parseOwnerMoneyPeriodParams,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  resolveStoreSalesDayRange,
  resolveStoreSalesMonthRange,
  type StoreSalesGrain,
} from "@/lib/stores/sales/store-sales-period";
import { loadStoreSalesPeriodSummary } from "@/lib/stores/sales/load-store-sales-period.server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 사장님 매출 — `grain=day` (기간: today|yesterday|this_week|this_month|last_month|custom, 없음·all → this_month, 최대 92일)
 * · `grain=month` (최근 12개월). 줄마다 같은 날/달 순수수료(부과 시각 기준, 정산 화면과 같은 함수)를 붙인다.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
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

  const sp = req.nextUrl.searchParams;
  const grain: StoreSalesGrain = sp.get("grain") === "month" ? "month" : "day";
  let period: string;
  let fromIso: string;
  let toIso: string;
  if (grain === "month") {
    ({ fromIso, toIso } = resolveStoreSalesMonthRange());
    period = "last_12_months";
  } else {
    const parsed = parseOwnerMoneyPeriodParams(sp);
    const range = resolveStoreSalesDayRange(parsed.period, parsed.fromDay, parsed.toDay);
    if (!range.ok) return NextResponse.json({ ok: false, error: range.error }, { status: 400 });
    ({ fromIso, toIso, period } = range);
  }

  try {
    const [sales, commission] = await Promise.all([
      loadStoreSalesPeriodSummary(sb, { storeIds: [sid], fromIso, toIso, grain }),
      loadStoreCommissionBreakdown(sb, { storeIds: [sid], fromIso, toIso, group: grain }),
    ]);
    const feeByBucket = new Map(commission.map((c) => [c.bucket, c.netCommissionMinor]));
    return NextResponse.json({
      ok: true,
      grain,
      period: { period, fromIso, toIso, timezone: STORE_COMMISSION_TIMEZONE },
      totals: {
        ...sales.totals,
        netCommissionMinor: commission.reduce((s, c) => s + c.netCommissionMinor, 0),
      },
      rows: sales.rows.map((r) => ({ ...r, netCommissionMinor: feeByBucket.get(r.bucket) ?? 0 })),
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[/api/me/stores/[storeId]/sales GET]", e, 500);
  }
}
