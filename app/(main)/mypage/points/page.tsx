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
import { MyListPager } from "@/components/mypage/ds/MyListPager";
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
  fetchMePointChargeRequests,
  fetchMePoints,
  ME_POINTS_DEFAULT_PERIOD,
  peekMePointsCache,
  type MePointsExpiring,
  type MePointsPeriodQuery,
  type MePointsResponse,
} from "@/lib/points/me-points-client";
import { CommissionPeriodFilter } from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  PointChargePeriodSummaryLine,
  PointPeriodSummaryCard,
  pointHistoryCountLabel,
} from "@/components/points/PointPeriodSummary";
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

/** 필리핀 시간 오늘 `YYYY-MM-DD` — 기간 지정 기본값 */
function manilaTodayDay(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

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
  /** 충전 탭은 같은 응답의 충전 요청 목록 — 내역 필터는 직전 값 유지(재조회 없음) */
  const [historyFilter, setHistoryFilter] = useState<PointFinancialFilter>(
    activeTab === "charges" ? "all" : activeTab
  );
  const nextHistoryFilter = pointsHistoryFilterForTab(activeTab, historyFilter);
  if (nextHistoryFilter !== historyFilter) setHistoryFilter(nextHistoryFilter);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = normalizePointsLegacyViewQuery(window.location.search);
    if (next == null) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, []);

  /** null = 로딩 중·조회 실패 → "—". 음수는 실제 잔액(D4). */
  const [balance, setBalance] = useState<number | null>(null);
  const [items, setItems] = useState<PointFinancialHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [expiring, setExpiring] = useState<MePointsExpiring | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const cancelGuard = useMypageSubmitGuard();
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);
  /** 기간 (PHT) — 기본 이번 달. 합계·내역·충전 신청이 모두 이 기간 (설계 H-6·H-7) */
  const [periodQ, setPeriodQ] = useState<MePointsPeriodQuery>(ME_POINTS_DEFAULT_PERIOD);
  const [periodSummary, setPeriodSummary] = useState<MePointsResponse["periodSummary"]>(null);
  const [periodSummaryError, setPeriodSummaryError] = useState(false);
  const [historyTotal, setHistoryTotal] = useState<number | null>(null);
  const [chargePage, setChargePage] = useState<MePointsResponse["chargeRequestsPage"] | null>(null);
  const [chargeSummary, setChargeSummary] = useState<MePointsResponse["chargeSummary"]>(null);
  const [pendingChargeCount, setPendingChargeCount] = useState<number | null>(null);
  const [chargesLoadingMore, setChargesLoadingMore] = useState(false);
  const [chargesMoreError, setChargesMoreError] = useState(false);
  /** 탭 전환 등으로 이전 요청 응답이 늦게 와도 덮어쓰지 않도록 */
  const requestIdRef = useRef(0);

  /** 첫 페이지 응답 → 화면 상태 (캐시·새 응답 공용) */
  const applyFirstPage = useCallback((json: MePointsResponse) => {
    const b = Number(json.balance);
    setBalance(Number.isFinite(b) ? Math.trunc(b) : null);
    setItems(Array.isArray(json.history?.items) ? json.history!.items! : []);
    setHasMore(Boolean(json.history?.hasMore));
    setNextCursor(json.history?.nextCursor ?? null);
    setHistoryTotal(typeof json.history?.total === "number" ? json.history.total : null);
    setRequests(Array.isArray(json.chargeRequests) ? json.chargeRequests : []);
    setChargePage(json.chargeRequestsPage ?? null);
    setChargeSummary(json.chargeSummary ?? null);
    setPendingChargeCount(typeof json.pendingChargeCount === "number" ? json.pendingChargeCount : null);
    setPeriodSummary(json.periodSummary ?? null);
    setPeriodSummaryError(Boolean(json.periodSummaryError));
    setExpiring(json.expiring ?? null);
  }, []);

  /** 재진입 메모리 캐시 — 첫 페인트 전에 그려 "매번 로딩" 제거(감사 §5-4). 이후 조용히 갱신 */
  useLayoutEffect(() => {
    const cached = peekMePointsCache(historyFilter, undefined, periodQ);
    if (!cached?.ok) return;
    applyFirstPage(cached);
    setLoaded(true);
    setLoading(false);
    // 첫 마운트에서만 캐시를 그린다 — 탭 전환은 기존 목록 유지 + 작은 로딩(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null; silent?: boolean }) => {
      const append = Boolean(opts?.append);
      /** 앱 복귀 갱신 — 로딩 표시 없이, 실패해도 보이던 화면 유지 */
      const silent = Boolean(opts?.silent) && !append;
      const reqId = append ? requestIdRef.current : ++requestIdRef.current;
      const isStale = () => requestIdRef.current !== reqId;
      if (append) {
        setLoadingMore(true);
        setMoreError(false);
      } else if (!silent) setLoading(true);
      try {
        const { ok: resOk, json } = await fetchMePoints({
          filter: historyFilter,
          cursor: opts?.cursor ?? null,
          period: periodQ,
        });
        if (isStale()) return;
        if (!resOk || !json?.ok) {
          if (append) {
            setMoreError(true);
            return;
          }
          if (silent) return;
          setLoadError(json?.error ?? "points_load_failed");
          setBalance(null);
          setItems([]);
          setRequests([]);
          setExpiring(null);
          return;
        }
        setLoadError(null);
        if (append) {
          const nextBalance = Number(json.balance);
          setBalance(Number.isFinite(nextBalance) ? Math.trunc(nextBalance) : null);
          const pageItems = Array.isArray(json.history?.items) ? json.history!.items! : [];
          setItems((prev) => [...prev, ...pageItems]);
          setHasMore(Boolean(json.history?.hasMore));
          setNextCursor(json.history?.nextCursor ?? null);
          if (typeof json.history?.total === "number") setHistoryTotal(json.history.total);
        } else {
          applyFirstPage(json);
          setChargesMoreError(false);
        }
      } catch {
        if (isStale()) return;
        if (append) {
          setMoreError(true);
          return;
        }
        if (silent) return;
        setLoadError("points_load_failed");
        setBalance(null);
        setItems([]);
        setRequests([]);
        setExpiring(null);
      } finally {
        if (!isStale()) {
          setLoading(false);
          setLoadingMore(false);
          if (!append) setLoaded(true);
        }
      }
    },
    [historyFilter, periodQ, applyFirstPage]
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** 충전 신청 「더 보기」 — 같은 기간의 다음 20건 */
  const loadMoreCharges = useCallback(async () => {
    if (chargesLoadingMore) return;
    setChargesLoadingMore(true);
    setChargesMoreError(false);
    const reqId = requestIdRef.current;
    const res = await fetchMePointChargeRequests({ period: periodQ, offset: requests.length });
    setChargesLoadingMore(false);
    if (requestIdRef.current !== reqId) return;
    if (!res.ok) {
      setChargesMoreError(true);
      return;
    }
    setRequests((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...res.chargeRequests.filter((r) => !seen.has(r.id))];
    });
    if (res.chargeRequestsPage) setChargePage(res.chargeRequestsPage);
  }, [chargesLoadingMore, periodQ, requests.length]);

  /**
   * 실기 FAIL 2026-11-03: 관리자 지급·회수·충전 승인 뒤에도 열려 있던 화면은 이전 잔액을 보여 줌
   * → 앱 복귀·창 포커스 때 다시 불러온다 (사장님 Cash 화면 DEF-73 과 같은 방식).
   */
  const refetchOnRestore = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchOnRestore, { enableWindowFocusRefetch: true });
  // H-12 — 충전 승인·반려 알림이 오면 열린 화면도 갱신 (다시 들어가지 않아도)
  useRefetchOnNotificationArrival(refetchOnRestore);

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
        await load();
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
  const chargesHasMore = chargePage ? requests.length < chargePage.total : false;
  const firstLoading = loading && !loaded;
  const expiringTotal = expiring?.totalExpiringPoint ?? 0;

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
                  {/* 충전 요청 줄 — 대기 n ›, 대기 0 이면 숨김 */}
                  {pendingCharges > 0 ? (
                    <MyRow
                      href={withCustomerCenterFrom("/mypage/points?tab=charges", from)}
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
                  onChange={(next) => {
                    const today = manilaTodayDay();
                    setPeriodQ(
                      next.period === "custom"
                        ? { period: "custom", fromDay: next.fromDay || today, toDay: next.toDay || today }
                        : { period: next.period }
                    );
                  }}
                />
              </div>

              {!loadError ? (
                <PointPeriodSummaryCard summary={periodSummary ?? null} error={periodSummaryError} lang={lang} />
              ) : null}

              <MyTabs
                value={activeTab}
                onChange={setTab}
                items={tabs.map(({ id, label }) => ({ id, label, testId: `points-tab-${id}` }))}
              />

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
                  {chargeSummary ? (
                    <PointChargePeriodSummaryLine summary={chargeSummary} lang={lang} />
                  ) : null}
                  {chargePage ? (
                    <p className="mb-2 sam-text-helper text-sam-muted" data-testid="points-charges-count">
                      {pointHistoryCountLabel(chargePage.total, requests.length, lang)}
                    </p>
                  ) : null}
                  <PointChargeRequestList
                    requests={requests}
                    onCancel={(id) => {
                      if (cancelGuard.pending) return;
                      setCancelTarget(id);
                    }}
                  />
                  <MyListPager
                    hasMore={chargesHasMore}
                    loading={chargesLoadingMore}
                    error={chargesMoreError}
                    onLoadMore={loadMoreCharges}
                  />
                </div>
              ) : (
                <>
                  {/* 탭 전환 재조회 — 기존 목록 유지 + 작은 로딩 표시 */}
                  {loading && items.length > 0 ? (
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-sam-border-soft" aria-live="polite">
                      <span className="sr-only">{t("common_loading")}</span>
                      <span className="block h-full w-1/3 bg-sam-primary motion-safe:animate-pulse" />
                    </div>
                  ) : null}
                  {loading && items.length === 0 ? (
                    <PointsHistorySkeleton />
                  ) : (
                    <PointFinancialHistoryList items={items} loading={false} onSelect={setSelected} />
                  )}
                  {historyTotal != null && !(loading && items.length === 0) ? (
                    <p className="text-center sam-text-helper text-sam-muted" data-testid="points-history-count">
                      {pointHistoryCountLabel(historyTotal, items.length, lang)}
                    </p>
                  ) : null}
                  <MyListPager
                    hasMore={hasMore}
                    loading={loadingMore}
                    error={moreError}
                    onLoadMore={() => load({ append: true, cursor: nextCursor })}
                  />
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
