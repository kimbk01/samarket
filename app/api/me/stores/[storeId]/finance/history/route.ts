import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  parseOwnerMoneyPeriodParams,
  resolveStoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  categoryKinds,
  loadCashPeriodSummary,
  loadCoinPeriodSummary,
  loadWalletHistoryPage,
  type WalletKind,
} from "@/lib/finance/wallet-period-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZES = [20, 50, 100] as const;

/**
 * GET — 사장님 Coin·Cash 기간 내역 (Owner 2026-11-03).
 * `wallet=coin|cash` · `period=today|yesterday|this_week|this_month|last_month|custom` (없음·all → this_month) (`from`/`to` YYYY-MM-DD, PHT) · `category` · `offset` · `limit`.
 * 기간을 안 보내면 이번 달. 합계는 기간 전체(서버), 목록은 페이지.
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
  const wallet: WalletKind = sp.get("wallet") === "cash" ? "cash" : "coin";
  // 사장님 화면 — 기간 없음·「전체」 → 이번 달 (누적 금지 · Owner 2026-11-03 §6-2)
  const parsed = parseOwnerMoneyPeriodParams(sp);
  const range = resolveStoreCommissionPeriod(parsed.period, parsed.fromDay, parsed.toDay);
  const category = sp.get("category");
  const kinds = categoryKinds(wallet, category);
  const limitRaw = Math.trunc(Number(sp.get("limit") ?? "20"));
  const limit = (PAGE_SIZES as readonly number[]).includes(limitRaw) ? limitRaw : 20;
  const offset = Math.max(0, Math.trunc(Number(sp.get("offset") ?? "0")) || 0);

  const [summary, page] = await Promise.all([
    wallet === "coin" ? loadCoinPeriodSummary(sb, sid, range) : loadCashPeriodSummary(sb, sid, range),
    loadWalletHistoryPage(sb, { storeId: sid, wallet, range, kinds, offset, limit }),
  ]);
  if (!summary || !page) {
    return NextResponse.json({ ok: false, error: "history_unavailable" }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    wallet,
    period: { period: parsed.period, fromDay: parsed.fromDay, toDay: parsed.toDay, ...range },
    category: kinds ? category : null,
    summary,
    rows: page.rows,
    total: page.total,
    offset,
    limit,
  });
}
