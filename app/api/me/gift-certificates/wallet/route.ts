import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadGiftWallet, loadGiftWalletOverviewSummary } from "@/lib/gift-certificate/load-gift-wallet";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  loadGiftHistoryPage,
  loadGiftWalletPeriodSummary,
  parseGiftHistoryKind,
  parseGiftHistoryPageParams,
} from "@/lib/gift-certificate/gift-wallet-history";
import { resolvePointHistoryPeriod } from "@/lib/points/point-period-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/gift-certificates/wallet
 * - 기본: 지갑 전체(보유·받은 선물 대기·보낸 선물·사용 완료) — 예전 그대로 (메신저 선물 흐름도 사용)
 * - `summary=1`: 내정보 홈 건수
 * - `section=history&kind=used|sent&offset=&limit=&period=&from=&to=` (C-4): 사용 완료·보낸 선물 한 쪽 + total,
 *   `periodSummary=0` 이 아니면 기간 합계(구매·사용·받은 선물·보낸 선물). 기간 = PHT 날짜, 보내지 않으면 전체.
 */
export async function GET(req: Request) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const sp = new URL(req.url).searchParams;
  if (sp.get("section") === "history") {
    const kind = parseGiftHistoryKind(sp.get("kind"));
    if (!kind) return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
    const { offset, limit } = parseGiftHistoryPageParams(sp);
    // 기간을 보내지 않으면 전체 (상품권 기본 기간 = 전체)
    const period = sp.get("period")
      ? resolvePointHistoryPeriod(sp)
      : { period: "all" as const, fromDay: null, toDay: null, fromIso: null, toIso: null, explicit: false };
    const range = { fromIso: period.fromIso, toIso: period.toIso };
    const [pageRes, sumRes] = await Promise.all([
      loadGiftHistoryPage(sb, { userId, kind, offset, limit, ...range }),
      sp.get("periodSummary") === "0" ? Promise.resolve(null) : loadGiftWalletPeriodSummary(sb, { userId, ...range }),
    ]);
    if (!pageRes.ok) return NextResponse.json({ ok: false, error: pageRes.error }, { status: 500 });
    return NextResponse.json({
      ok: true,
      ...pageRes.page,
      period,
      periodSummary: sumRes && sumRes.ok ? sumRes.summary : null,
      ...(sumRes && !sumRes.ok ? { periodSummaryError: true } : {}),
    });
  }
  const summaryFlag = sp.get("summary");
  if (summaryFlag === "1" || summaryFlag === "true") {
    const loaded = await loadGiftWalletOverviewSummary(sb, userId);
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, summary: loaded.summary });
  }
  const loaded = await loadGiftWallet(sb, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, wallet: loaded.wallet });
}
