"use client";

import { MyTabs } from "@/components/mypage/ds/MyTabs";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Receipt } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { CurrencyAmount } from "@/components/currency";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import {
  PointFinancialDetailSheet,
  PointFinancialHistoryList,
} from "@/components/points/PointFinancialHistoryList";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow } from "@/components/mypage/ds/MyRow";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import type { PointChargeRequest } from "@/lib/types/point";
import type {
  PointFinancialFilter,
  PointFinancialHistoryItem,
} from "@/lib/points/point-financial-history";
import {
  resolveCustomerCenterBackHref,
  withCustomerCenterFrom,
} from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import {
  fetchMePoints,
  ME_POINTS_PAGE_SIZE,
  peekMePointsCache,
  type MePointsExpiring,
  type MePointsPeriodQuery,
  type MePointsResponse,
} from "@/lib/points/me-points-client";
import {
  checkPointsPeriod,
  clampPointsPage,
  parsePointsScreenUrlState,
  pointsPeriodKey,
  writePointsScreenUrlState,
} from "@/lib/points/points-screen-url-state";
// 쪽 이동은 사장님 화면과 같은 부품 (「전체 N건 중 a–b · 이전 · 쪽/전체 · 다음」 · 재감사 R6-a)
import { CommissionPeriodFilter, LedgerPager } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { PointChargePeriodSummaryLine, PointPeriodSummaryCard } from "@/components/points/PointPeriodSummary";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import {
  countCancellableChargeRequests,
  normalizePointsLegacyViewQuery,
  pointsHistoryFilterForTab,
  POINTS_SCREEN_TAB_VALUES,
  type PointsScreenTab,
} from "@/lib/points/points-screen-tabs";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/** S40 스켈레톤 — 잔액 카드(큰 숫자 블록) + 버튼 2 + 줄 2 + 탭 + 내역 행 6 */
function PointsScreenSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="points-skeleton" className="flex flex-col gap-4">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
        <span className={`block h-4 w-16 ${bone}`} />
        <span className={`mt-3 block h-7 w-[120px] ${bone}`} />
        <span className={`mt-3 block h-3 w-[55%] ${bone}`} />
      </div>
      <div className="flex gap-2">
        <span className={`h-[46px] flex-1 ${bone}`} />
        <span className={`h-[46px] flex-1 ${bone}`} />
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {[0, 1].map((i) => (
          <div key={i} className="flex min-h-[52px] items-center gap-3 border-t border-sam-border-soft px-4 first:border-t-0">
            <span className="h-9 w-9 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className={`h-3.5 flex-1 ${bone}`} />
            <span className={`h-3.5 w-16 ${bone}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-4 border-b border-sam-border-soft pb-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 flex-1 ${bone}`} />
        ))}
      </div>
      <PointsHistorySkeleton />
    </div>
  );
}

function PointsHistorySkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="flex items-center gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={`h-3.5 w-[55%] ${bone}`} />
            <span className={`h-3 w-[35%] ${bone}`} />
          </span>
          <span className={`h-4 w-16 shrink-0 ${bone}`} />
        </li>
      ))}
    </ul>
  );
}

export default function MypagePointsPage() {
  return (
    <Suspense fallback={<PointsScreenFallback />}>
      <MypagePointsPageInner />
    </Suspense>
  );
}

/** `useSearchParams` 대기 — 피드 스켈레톤 대신 같은 구조 스켈레톤 */
function PointsScreenFallback() {
  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} pt-2`}>
          <PointsScreenSkeleton />
        </div>
      </div>
    </div>
  );
}

function MypagePointsPageInner() {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = resolveCustomerCenterBackHref(from);
  /** `?tab=all|credit|debit|charges` 쓰기(replace) — 기존 `view=charges` 는 아래에서 `tab=charges` 로 정규화 */
  const [tab, setTab] = useMypageTabParam<PointsScreenTab>({
    values: POINTS_SCREEN_TAB_VALUES,
    defaultValue: "all",
  });
  const legacyViewCharges = searchParams.get("view") === "charges";
  const activeTab: PointsScreenTab = legacyViewCharges ? "charges" : tab;
  /** 주소에 남긴 기간·쪽·대기 거르기 — 다른 화면 갔다 돌아오면 그대로 (재감사 R6-d) */
  const [urlInit] = useState(() => parsePointsScreenUrlState(searchParams));
  /** 기간 (PHT) — 기본 이번 달. 합계·내역·충전 신청이 모두 이 기간 (설계 H-6·H-7) */
  const [periodQ, setPeriodQ] = useState<MePointsPeriodQuery>(urlInit.period);
  /** 내역·충전 신청 쪽 (0부터) — 쪽 이동 (R6-a) */
  const [histPage, setHistPage] = useState(urlInit.histPage);
  const [chargePageNo, setChargePageNo] = useState(urlInit.chargePage);
  /** 「대기 n」 에서 들어오면 기간 무관 대기 건만 (R6-e) */
  const [chargeStatus, setChargeStatus] = useState<"pending" | null>(urlInit.chargeStatus);
  /** 충전 탭은 별도 목록 — 내역 필터는 직전 값 유지(재조회 없음) */
  const [historyFilter, setHistoryFilter] = useState<PointFinancialFilter>(
    activeTab === "charges" ? "all" : activeTab
  );
  const nextHistoryFilter = pointsHistoryFilterForTab(activeTab, historyFilter);
  if (nextHistoryFilter !== historyFilter) {
    setHistoryFilter(nextHistoryFilter);
    setHistPage(0);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = normalizePointsLegacyViewQuery(window.location.search);
    if (next == null) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, []);

  /** 기간·쪽·대기 거르기 → 주소 (기록 쌓지 않음 · R6-d) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = writePointsScreenUrlState(window.location.search, {
      period: periodQ,
      histPage,
      chargePage: chargePageNo,
      chargeStatus,
    });
    const cur = window.location.search.replace(/^\?/, "");
    if (next === cur) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  }, [periodQ, histPage, chargePageNo, chargeStatus]);

  /** null = 로딩 중·조회 실패 → "—". 음수는 실제 잔액(D4). */
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<PointFinancialHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [expiring, setExpiring] = useState<MePointsExpiring | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const cancelGuard = useMypageSubmitGuard();
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);
  const [periodSummary, setPeriodSummary] = useState<MePointsResponse["periodSummary"]>(null);
  const [periodSummaryError, setPeriodSummaryError] = useState(false);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [chargeTotal, setChargeTotal] = useState<number | null>(null);
  const [chargeSummary, setChargeSummary] = useState<MePointsResponse["chargeSummary"]>(null);
  const [pendingChargeCount, setPendingChargeCount] = useState<number | null>(null);
  /** 탭·기간·쪽 전환 등으로 이전 요청 응답이 늦게 와도 덮어쓰지 않도록 */
  const requestIdRef = useRef(0);
  /** 지금 화면에 있는 기간 합계가 어느 기간 것인지 — 쪽만 바꿀 때는 합계를 다시 읽지 않는다 */
  const summaryKeyRef = useRef<string | null>(null);
  /** 첫 조회(캐시를 그렸어도)·취소 뒤는 합계까지 새로 */
  const forceSummaryRef = useRef(true);
  /** 첫 페인트를 캐시로 그렸으면 첫 갱신은 조용히 */
  const cachePaintedRef = useRef(false);
  /** 잔액을 한 번이라도 받았는가 — 직접 기간이 덜 골라진 동안은 다시 조회하지 않는다 (R4) */
  const balanceLoadedRef = useRef(false);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const periodCheck = checkPointsPeriod(periodQ);
  const pageQuery = useMemo(
    () => ({
      histOffset: histPage * ME_POINTS_PAGE_SIZE,
      chargeOffset: chargePageNo * ME_POINTS_PAGE_SIZE,
      chargeStatus,
    }),
    [histPage, chargePageNo, chargeStatus]
  );

  /** 응답 → 화면 상태 (캐시·새 응답 공용). 합계는 합계를 요청한 응답에서만 바꾼다 */
  const applyResponse = useCallback((json: MePointsResponse, withSummary: boolean) => {
    const b = Number(json.balance);
    setBalance(Number.isFinite(b) ? Math.trunc(b) : null);
    setItems(Array.isArray(json.history?.items) ? json.history!.items! : []);
    setHistoryTotal(typeof json.history?.total === "number" ? json.history.total : null);
    setRequests(Array.isArray(json.chargeRequests) ? json.chargeRequests : []);
    setChargeTotal(typeof json.chargeRequestsPage?.total === "number" ? json.chargeRequestsPage.total : null);
    setPendingChargeCount(typeof json.pendingChargeCount === "number" ? json.pendingChargeCount : null);
    setExpiring(json.expiring ?? null);
    if (withSummary) {
      setPeriodSummary(json.periodSummary ?? null);
      setPeriodSummaryError(Boolean(json.periodSummaryError));
      setChargeSummary(json.chargeSummary ?? null);
    }
  }, []);

  /** 재진입 메모리 캐시 — 첫 페인트 전에 그려 "매번 로딩" 제거(감사 §5-4). 이후 조용히 갱신 */
  useLayoutEffect(() => {
    if (checkPointsPeriod(periodQ) !== "ok") return;
    const cached = peekMePointsCache(historyFilter, undefined, periodQ, pageQuery);
    if (!cached?.ok) return;
    applyResponse(cached, true);
    summaryKeyRef.current = pointsPeriodKey(periodQ);
    cachePaintedRef.current = true;
    balanceLoadedRef.current = true;
    setLoaded(true);
    setLoading(false);
    // 첫 마운트에서만 캐시를 그린다 — 탭 전환은 기존 목록 유지 + 작은 로딩(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; refreshSummary?: boolean }) => {
      /** 앱 복귀·알림 갱신 — 로딩 표시 없이, 실패해도 보이던 화면 유지. 지금 쪽 + 합계만 다시 읽는다 (R5-c) */
      const silent = Boolean(opts?.silent);
      const reqId = ++requestIdRef.current;
      const isStale = () => requestIdRef.current !== reqId;
      const valid = checkPointsPeriod(periodQ) === "ok";
      if (!valid && balanceLoadedRef.current) {
        // 두 날짜가 다 정해지기 전·시작 > 종료 — 조회하지 않는다 (R4)
        setLoading(false);
        setLoaded(true);
        return;
      }
      const pk = pointsPeriodKey(periodQ);
      const withSummary =
        valid && (silent || Boolean(opts?.refreshSummary) || forceSummaryRef.current || summaryKeyRef.current !== pk);
      if (!silent) setLoading(true);
      try {
        /* 직접 기간이 덜 골라졌거나 거꾸로면 기간 조회를 하지 않는다 (R4) — 잔액·소멸 예정만 기간 없이 */
        const { ok: resOk, json } = await fetchMePoints({
          filter: historyFilter,
          period: valid ? periodQ : undefined,
          page: valid
            ? { ...pageQuery, withSummary }
            : { histOffset: 0, chargeOffset: 0, chargeStatus: null, withSummary: false },
        });
        if (isStale()) return;
        if (!resOk || !json?.ok) {
          if (silent) return;
          setLoadError(json?.error ?? "points_load_failed");
          setBalance(null);
          setItems([]);
          setRequests([]);
          setExpiring(null);
          return;
        }
        setLoadError(null);
        balanceLoadedRef.current = true;
        if (!valid) {
          const b = Number(json.balance);
          setBalance(Number.isFinite(b) ? Math.trunc(b) : null);
          setExpiring(json.expiring ?? null);
          setPendingChargeCount(typeof json.pendingChargeCount === "number" ? json.pendingChargeCount : null);
          return;
        }
        applyResponse(json, withSummary);
        if (withSummary) {
          summaryKeyRef.current = pk;
          forceSummaryRef.current = false;
        }
        /* 건수가 줄어 지금 쪽이 비면 마지막 쪽으로 — 위치는 최대한 유지 */
        if (typeof json.history?.total === "number") {
          const c = clampPointsPage(histPage, json.history.total, ME_POINTS_PAGE_SIZE);
          if (c !== histPage) setHistPage(c);
        }
        if (typeof json.chargeRequestsPage?.total === "number") {
          const c = clampPointsPage(chargePageNo, json.chargeRequestsPage.total, ME_POINTS_PAGE_SIZE);
          if (c !== chargePageNo) setChargePageNo(c);
        }
      } catch {
        if (isStale()) return;
        if (silent) return;
        setLoadError("points_load_failed");
        setBalance(null);
        setItems([]);
        setRequests([]);
        setExpiring(null);
      } finally {
        if (!isStale()) {
          setLoading(false);
          setLoaded(true);
        }
      }
    },
    [historyFilter, periodQ, pageQuery, histPage, chargePageNo, applyResponse]
  );

  useEffect(() => {
    const silent = cachePaintedRef.current;
    cachePaintedRef.current = false;
    void load(silent ? { silent: true } : undefined);
  }, [load]);

  /**
   * 실기 FAIL 2026-11-03: 관리자 지급·회수·충전 승인 뒤에도 열려 있던 화면은 이전 잔액을 보여 줌
   * → 앱 복귀·창 포커스 때 다시 불러온다 (사장님 Cash 화면 DEF-73 과 같은 방식).
   */
  const refetchOnRestore = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchOnRestore, { enableWindowFocusRefetch: true });
  // H-12 — 충전 승인·반려 알림이 오면 열린 화면도 갱신 (다시 들어가지 않아도)
  useRefetchOnNotificationArrival(refetchOnRestore);

  /** 기간을 바꾸면 이전 기간 숫자를 지우고 새 응답까지 로딩 (R5-c) — 진행 중 응답은 버린다 */
  const changePeriod = useCallback((next: MePointsPeriodQuery) => {
    requestIdRef.current += 1;
    summaryKeyRef.current = null;
    setPeriodQ(next);
    setHistPage(0);
    setChargePageNo(0);
    setPeriodSummary(null);
    setPeriodSummaryError(false);
    setChargeSummary(null);
    setItems([]);
    setRequests([]);
    setHistoryTotal(null);
    setChargeTotal(null);
    setLoading(true);
  }, []);

  const goPage = useCallback((setter: (n: number) => void, offset: number) => {
    setter(clampPointsPage(Math.floor(offset / ME_POINTS_PAGE_SIZE), Number.MAX_SAFE_INTEGER, ME_POINTS_PAGE_SIZE));
    listTopRef.current?.scrollIntoView?.({ block: "start" });
  }, []);

  /** 「충전 요청 대기 n」 → 충전 탭 · 대기 건만 (기간 무관 · 숫자와 같은 조건) */
  const openPendingCharges = useCallback(() => {
    setChargeStatus("pending");
    setChargePageNo(0);
    setTab("charges");
  }, [setTab]);

  /** 충전 요청 취소 — 확인 시트(danger)에서 확인한 뒤에만 호출, 결과 토스트 */
  const cancelCharge = async (id: string) => {
    try {
      const res = await fetch(`/api/me/points/charge/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j.ok) {
        showMypageToast(t("mypage_oa_charge_cancel_done"), "success");
        invalidateMypageSummary();
        await load({ refreshSummary: true });
      } else {
        showMypageToast(t("mypage_oa_charge_cancel_failed"), "error");
      }
    } catch {
      showMypageToast(t("mypage_oa_charge_cancel_failed"), "error");
    }
  };

  const tabs = useMemo(
    () =>
      [
        { id: "all" as const, label: safeT("point_fin_tab_all", { fallbackKo: "전체", fallbackEn: "All" }) },
        { id: "credit" as const, label: t("mypage_oa_points_tab_credit") },
        { id: "debit" as const, label: t("mypage_oa_points_tab_debit") },
        { id: "charges" as const, label: t("mypage_oa_points_tab_charges") },
      ] as const,
    [safeT, t]
  );

  /** 취소할 수 있는 대기 건만 — 보류(on_hold)는 회원이 취소할 수 없어 집계에서 제외 (D19) */
  const pendingCharges = pendingChargeCount ?? countCancellableChargeRequests(requests);
  const lang = language === "en" ? "en" : "ko";
  const firstLoading = loading && !loaded;
  const expiringTotal = expiring?.totalExpiringPoint ?? 0;
  const pick = (ko: string, en: string) => (lang === "en" ? en : ko);
  const periodBlocked =
    periodCheck === "ok" ? null : (
      <p
        className={`rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 sam-text-helper ${
          periodCheck === "inverted" ? "text-sam-danger" : "text-sam-muted"
        }`}
        role={periodCheck === "inverted" ? "alert" : "note"}
        data-testid="points-period-invalid"
      >
        {periodCheck === "inverted"
          ? pick("시작일이 종료일보다 늦습니다", "The start date is after the end date")
          : pick("시작일과 종료일을 모두 고르세요", "Choose both a start and an end date")}
      </p>
    );
  /** 쪽을 바꾸는 동안 이전 쪽은 흐리게 */
  const dim = loading && loaded ? "opacity-50 transition-opacity" : "";

  return (
    <MyScreen title={t("common_points")} backHref={backHref} template="asset" preferHistoryBack={false}>
      <div className="flex flex-col gap-5">
          {firstLoading ? (
            <PointsScreenSkeleton />
          ) : (
            <>
              {/* 잔액 — 오류·확인 전 "—", 음수 빨강(D4) */}
              <PointBalanceCard balance={balance} />

              <div className="flex gap-2">
                <Link
                  href={withCustomerCenterFrom("/mypage/points/charge", from)}
                  className={`${Sam.btn.primaryCombo} ${Sam.focusRing} flex-1`}
                >
                  {safeT("point_fin_cta_charge", { fallbackKo: "충전하기", fallbackEn: "Top up" })}
                </Link>
                <Link
                  href={withCustomerCenterFrom("/mypage/points/promotions", from)}
                  className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} flex-1`}
                >
                  {t("mypage_oa_points_cta_promotions")}
                </Link>
              </div>

              {!loadError ? (
                <MyGroup>
                  {/* 소멸 예정 줄 — 금액·가장 빠른 날짜 › S42 */}
                  <MyRow
                    first
                    href={withCustomerCenterFrom("/mypage/points/expiring", from)}
                    icon={<CalendarClock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />}
                    title={t("points_ui_expiring_section")}
                    value={
                      expiring ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CurrencyAmount currency="point" amount={expiringTotal} compactPoint className="text-[14px]" />
                          {expiring.nearestExpireAt && expiringTotal > 0 ? (
                            <span className="sam-text-xxs text-sam-meta">
                              {formatMypageDate(expiring.nearestExpireAt, { lang: language })}
                            </span>
                          ) : null}
                        </span>
                      ) : null
                    }
                    valueState={expiring ? "ready" : "empty"}
                  />
                  {/* 충전 요청 줄 — 대기 n ›, 대기 0 이면 숨김. 누르면 대기 건 목록 (기간 무관 · R6-e) */}
                  {pendingCharges > 0 ? (
                    <MyRow
                      href={withCustomerCenterFrom("/mypage/points?tab=charges&cstatus=pending", from)}
                      onPress={openPendingCharges}
                      testId="points-pending-charges-row"
                      icon={<Receipt className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />}
                      title={t("mypage_oa_points_charge_requests_row")}
                      value={t("mypage_oa_points_pending_count", { count: pendingCharges })}
                    />
                  ) : null}
                </MyGroup>
              ) : null}

              {/* 기간 (PHT) — 합계·내역·충전 신청 공통 (설계 H-6·H-7) */}
              <div data-testid="points-period-filter">
                <CommissionPeriodFilter
                  period={periodQ.period}
                  fromDay={periodQ.fromDay ?? ""}
                  toDay={periodQ.toDay ?? ""}
                  lang={lang}
                  onChange={(next) =>
                    changePeriod(
                      next.period === "custom"
                        ? { period: "custom", fromDay: next.fromDay, toDay: next.toDay }
                        : { period: next.period }
                    )
                  }
                />
              </div>

              {!loadError ? (
                periodBlocked ?? (
                  loading && !periodSummary && !periodSummaryError ? (
                    <div aria-busy="true" className="h-[132px] rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
                  ) : (
                    <PointPeriodSummaryCard summary={periodSummary ?? null} error={periodSummaryError} lang={lang} />
                  )
                )
              ) : null}

              <div ref={listTopRef} className="scroll-mt-16">
                <MyTabs
                  value={activeTab}
                  onChange={setTab}
                  items={tabs.map(({ id, label }) => ({ id, label, testId: `points-tab-${id}` }))}
                />
              </div>

              {loadError ? (
                /* 오류 — 잔액 "—" + 내역 영역만 오류+재시도 (빈 문구와 동시 표시 금지) */
                <MyStateView
                  kind="error"
                  error={{ message: t("mypage_oa_points_load_failed"), onRetry: () => void load() }}
                />
              ) : activeTab === "charges" ? (
                <div>
                  <p className="mb-3 sam-text-helper text-sam-muted">
                    {safeT("point_fin_charges_hint", {
                      fallbackKo: "입금 신청 상태입니다. 실제 포인트 지급은 승인 후 내역에 표시됩니다.",
                      fallbackEn:
                        "These are deposit requests. Point credits appear in history after approval.",
                    })}
                  </p>
                  {/* 기간 신청 / 대기 건만 (대기는 기간 무관) */}
                  <div className="mb-3 flex flex-wrap gap-1.5" data-testid="points-charge-status-filter">
                    {(
                      [
                        [null, pick("기간 내 신청", "In period")],
                        ["pending", pick(`대기 ${pendingCharges}`, `Pending ${pendingCharges}`)],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value ?? "all"}
                        type="button"
                        aria-pressed={chargeStatus === value}
                        onClick={() => {
                          if (chargeStatus === value) return;
                          setChargeStatus(value);
                          setChargePageNo(0);
                        }}
                        className={`${chargeStatus === value ? Sam.chip.activeCombo : Sam.chip.inactiveCombo} ${Sam.focusRing}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {chargeStatus === "pending" ? (
                    <p className="mb-2 sam-text-helper text-sam-muted">
                      {pick("기간과 관계없이 취소할 수 있는 대기 신청입니다.", "Pending requests you can cancel, regardless of period.")}
                    </p>
                  ) : periodBlocked ? null : chargeSummary ? (
                    <PointChargePeriodSummaryLine summary={chargeSummary} lang={lang} />
                  ) : null}
                  {chargeStatus !== "pending" && periodBlocked ? null : loading && requests.length === 0 ? (
                    <PointsHistorySkeleton />
                  ) : (
                    <div className={dim}>
                      <PointChargeRequestList
                        requests={requests}
                        onCancel={(id) => {
                          if (cancelGuard.pending) return;
                          setCancelTarget(id);
                        }}
                      />
                      {chargeTotal != null ? (
                        <div data-testid="points-charges-pager">
                          <LedgerPager
                            offset={chargePageNo * ME_POINTS_PAGE_SIZE}
                            pageSize={ME_POINTS_PAGE_SIZE}
                            total={chargeTotal}
                            loading={loading}
                            lang={lang}
                            onChange={(offset) => goPage(setChargePageNo, offset)}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : periodBlocked ? null : (
                <>
                  {loading && items.length === 0 ? (
                    <PointsHistorySkeleton />
                  ) : (
                    <div className={dim}>
                      <PointFinancialHistoryList items={items} loading={false} onSelect={setSelected} />
                      {historyTotal != null ? (
                        <div data-testid="points-history-pager">
                          <LedgerPager
                            offset={histPage * ME_POINTS_PAGE_SIZE}
                            pageSize={ME_POINTS_PAGE_SIZE}
                            total={historyTotal}
                            loading={loading}
                            lang={lang}
                            onChange={(offset) => goPage(setHistPage, offset)}
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      <PointFinancialDetailSheet item={selected} onClose={() => setSelected(null)} />
      <MobileConfirmBottomSheet
        open={cancelTarget != null}
        onCancel={() => setCancelTarget(null)}
        title={t("popup_q_cancel_charge_request")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("popup_btn_cancel_request")}
        confirmTone="danger"
        onConfirm={() => {
          const id = cancelTarget;
          setCancelTarget(null);
          if (id) void cancelGuard.run(() => cancelCharge(id));
        }}
      />
    </MyScreen>
  );
}
