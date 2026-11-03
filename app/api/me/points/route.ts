import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
// 충전 요청 매핑은 공용 하나만 (실기 FAIL 2026-11-03: 이 파일의 복사본이 반려 사유를 빼 회원에게 안 보였음) — point-period-history 안에서 사용
import {
  loadPointChargeRequestsPage,
  loadPointHistoryPeriodExtras,
  resolvePointHistoryPeriod,
} from "@/lib/points/point-period-history";
import {
  allocateExpiringEntries,
  computeExpiringPointsFromLedger,
  type ExpiringPointEntry,
} from "@/lib/points/point-expire-utils";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  loadPointFinancialSummary,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

/**
 * GET /api/me/points
 * Balance + Financial History Projection (ledger SSOT) + optional charge-request list.
 * Query: filter=all|credit|debit&limit=&cursor=
 *   period=today|this_week|this_month|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD (PHT 날짜, 서버가 UTC 경계 계산)
 *   chargeOffset=&chargeLimit= (충전 신청 페이지) · section=charges (충전 신청 다음 페이지만)
 * 기간을 보내지 않으면: 내역·충전 신청 목록은 예전처럼 기간 없이, 기간 합계(periodSummary)만 이번 달.
 * 응답 추가 필드: period · periodSummary · history.total · chargeRequestsPage · chargeSummary · pendingChargeCount
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    // 서버 설정 없음 — 잔액 0 성공 응답 금지(D4). 화면은 "확인 불가"로 표시한다.
    return NextResponse.json({ ok: false, error: "points_service_unavailable" }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const filter = parseFilter(searchParams.get("filter"));
  const limit = Number(searchParams.get("limit") ?? 30);
  const cursor = searchParams.get("cursor");
  const period = resolvePointHistoryPeriod(searchParams);
  const chargeOffset = Number(searchParams.get("chargeOffset") ?? 0);
  const chargeLimitRaw = searchParams.get("chargeLimit");
  const chargeLimit = chargeLimitRaw ? Number(chargeLimitRaw) : undefined;

  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String(profile?.nickname ?? "");

  /* 충전 신청 「더 보기」 — 그 목록만 (잔액·내역 재조회 없음) */
  if (searchParams.get("section") === "charges") {
    const pageRes = await loadPointChargeRequestsPage(sb, {
      userId,
      userNickname,
      fromIso: period.explicit ? period.fromIso : null,
      toIso: period.explicit ? period.toIso : null,
      offset: chargeOffset,
      limit: chargeLimit,
    });
    if (!pageRes.ok) return NextResponse.json({ ok: false, error: pageRes.error }, { status: 500 });
    const { items, ...chargeRequestsPage } = pageRes.page;
    return NextResponse.json({ ok: true, chargeRequests: items, chargeRequestsPage });
  }

  const summaryRes = await loadPointFinancialSummary(sb, userId);
  if (!summaryRes.ok) {
    // 잔액을 못 읽었으면 0 이 아니라 오류 — 화면은 "확인 불가"로 표시한다(D4).
    return NextResponse.json({ ok: false, error: "points_balance_unavailable" }, { status: 503 });
  }
  const summary = summaryRes.summary;
  const historyRes = await loadPointFinancialHistory(sb, {
    userId,
    filter,
    limit,
    cursor,
    fromIso: period.explicit ? period.fromIso : null,
    toIso: period.explicit ? period.toIso : null,
    withTotal: true,
  });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        balance: summary.balance,
        summary,
        history: { items: [], hasMore: false, nextCursor: null, total: 0 },
        ledger: [],
        chargeRequests: [],
        source: "missing_table",
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
  }

  /* 기간 합계·충전 신청(기간·페이지·합계) — 관리자 회원 상세와 같은 함수. 「더 보기」(cursor) 요청은 합계 생략 */
  const extrasRes = await loadPointHistoryPeriodExtras(sb, {
    userId,
    userNickname,
    period,
    chargeOffset,
    chargeLimit,
    withSummary: !cursor,
  });
  if (!extrasRes.ok) {
    return NextResponse.json({ ok: false, error: extrasRes.error }, { status: 500 });
  }
  const { chargeRequests, ...periodExtras } = extrasRes.extras;

  const history = serializePointFinancialPage(historyRes.page);

  /*
   * SSOT-19 F-17: 소멸 예정 = 미만료·미래 만료 적립분 합, 잔액 상한.
   * A8(S42): `entries` = 적립분별 금액(잔액 상한 FIFO 배분, 합 = totalExpiringPoint).
   * 조회 실패를 0 으로 남기지 않는다 — `expiring:null` + `expiringError:true` (화면은 오류+재시도).
   */
  let expiring: {
    totalExpiringPoint: number;
    nearestExpireAt: string | null;
    expiringEntriesCount: number;
    entries: ExpiringPointEntry[];
  } | null = { totalExpiringPoint: 0, nearestExpireAt: null, expiringEntriesCount: 0, entries: [] };
  let expiringError = false;
  const expRes = await sb
    .from("point_ledger")
    .select("amount, expires_at, expired_amount")
    .eq("user_id", userId)
    .gt("amount", 0)
    .not("expires_at", "is", null)
    .is("expired_amount", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(1000);
  if (!expRes.error) {
    const expRows = (expRes.data ?? []) as Array<{
      amount: number;
      expires_at: string | null;
      expired_amount: number | null;
    }>;
    const nowIso = new Date().toISOString();
    expiring = {
      ...computeExpiringPointsFromLedger(expRows, summary.balance, nowIso),
      entries: allocateExpiringEntries(expRows, summary.balance, nowIso),
    };
  } else {
    console.error("[GET me/points] expiring lookup failed", expRes.error.message);
    expiring = null;
    expiringError = true;
  }

  return NextResponse.json({
    ok: true,
    balance: summary.balance,
    summary,
    history,
    /** @deprecated use history.items — kept for older clients during cutover */
    ledger: history.items.map((item) => ({
      id: item.ledgerId,
      userId,
      userNickname,
      entryType: item.entryType,
      amount: item.signedAmount,
      balanceAfter: item.balanceAfter,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      description: item.description,
      createdAt: item.occurredAt,
      actorType: item.actorType,
    })),
    chargeRequests,
    ...periodExtras,
    expiring,
    ...(expiringError ? { expiringError: true } : {}),
    source: "supabase",
  });
}
