"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Receipt } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
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
  PointFinancialSummary,
} from "@/lib/points/point-financial-history";
import {
  resolveCustomerCenterBackHref,
  withCustomerCenterFrom,
} from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS, MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { fetchMePoints, peekMePointsCache, type MePointsExpiring } from "@/lib/points/me-points-client";
import {
  countCancellableChargeRequests,
  normalizePointsLegacyViewQuery,
  pointsHistoryFilterForTab,
  POINTS_SCREEN_TAB_VALUES,
  type PointsScreenTab,
} from "@/lib/points/points-screen-tabs";

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
        <div className={`mx-auto w-full min-w-0 ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} ${MYPAGE_GUTTER_X_CLASS} pt-2`}>
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
  const [summary, setSummary] = useState<PointFinancialSummary | null>(null);
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
  /** 탭 전환 등으로 이전 요청 응답이 늦게 와도 덮어쓰지 않도록 */
  const requestIdRef = useRef(0);

  /** 재진입 메모리 캐시 — 첫 페인트 전에 그려 "매번 로딩" 제거(감사 §5-4). 이후 조용히 갱신 */
  useLayoutEffect(() => {
    const cached = peekMePointsCache(historyFilter);
    if (!cached?.ok) return;
    const b = Number(cached.balance);
    setBalance(Number.isFinite(b) ? Math.trunc(b) : null);
    setSummary(cached.summary ?? null);
    setItems(Array.isArray(cached.history?.items) ? cached.history!.items! : []);
    setHasMore(Boolean(cached.history?.hasMore));
    setNextCursor(cached.history?.nextCursor ?? null);
    setRequests(Array.isArray(cached.chargeRequests) ? cached.chargeRequests : []);
    setExpiring(cached.expiring ?? null);
    setLoaded(true);
    setLoading(false);
    // 첫 마운트에서만 캐시를 그린다 — 탭 전환은 기존 목록 유지 + 작은 로딩(load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      const reqId = append ? requestIdRef.current : ++requestIdRef.current;
      const isStale = () => requestIdRef.current !== reqId;
      if (append) {
        setLoadingMore(true);
        setMoreError(false);
      } else setLoading(true);
      try {
        const { ok: resOk, json } = await fetchMePoints({ filter: historyFilter, cursor: opts?.cursor ?? null });
        if (isStale()) return;
        if (!resOk || !json?.ok) {
          if (append) {
            setMoreError(true);
            return;
          }
          setLoadError(json?.error ?? "points_load_failed");
          setBalance(null);
          setItems([]);
          setRequests([]);
          setExpiring(null);
          return;
        }
        setLoadError(null);
        const nextBalance = Number(json.balance);
        setBalance(Number.isFinite(nextBalance) ? Math.trunc(nextBalance) : null);
        setSummary(json.summary ?? null);
        const pageItems = Array.isArray(json.history?.items) ? json.history!.items! : [];
        setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
        setHasMore(Boolean(json.history?.hasMore));
        setNextCursor(json.history?.nextCursor ?? null);
        if (!append) {
          setRequests(Array.isArray(json.chargeRequests) ? json.chargeRequests : []);
          setExpiring(json.expiring ?? null);
        }
      } catch {
        if (isStale()) return;
        if (append) {
          setMoreError(true);
          return;
        }
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
    [historyFilter]
  );

  useEffect(() => {
    void load();
  }, [load]);

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
  const pendingCharges = countCancellableChargeRequests(requests);
  const firstLoading = loading && !loaded;
  const expiringTotal = expiring?.totalExpiringPoint ?? 0;

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("common_points")}
        subtitle={safeT("point_fin_home_subtitle", {
          fallbackKo: "잔액과 사용 내역을 확인합니다.",
          fallbackEn: "Check your balance and usage history.",
        })}
        backHref={backHref}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`mx-auto flex w-full min-w-0 flex-col gap-5 ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} ${MYPAGE_GUTTER_X_CLASS} pt-2 pb-6`}>
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

              {summary && !loadError ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                    <p className="sam-text-helper text-sam-muted">
                      {safeT("point_fin_sum_credit", { fallbackKo: "총 충전/지급", fallbackEn: "Total in" })}
                    </p>
                    <CurrencyAmount
                      currency="point"
                      amount={summary.totalCredit}
                      compactPoint
                      signed
                      className="sam-text-body"
                    />
                  </div>
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                    <p className="sam-text-helper text-sam-muted">
                      {safeT("point_fin_sum_debit", { fallbackKo: "총 사용/차감", fallbackEn: "Total out" })}
                    </p>
                    <CurrencyAmount
                      currency="point"
                      amount={-summary.totalDebit}
                      compactPoint
                      signed
                      className="sam-text-body"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex gap-0 border-b border-sam-border" role="tablist">
                {tabs.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    data-points-tab={id}
                    onClick={() => setTab(id)}
                    className={`flex-1 py-3 sam-text-body-secondary font-semibold transition-colors ${
                      activeTab === id
                        ? "border-b-[3px] border-sam-primary text-sam-primary"
                        : "text-sam-muted hover:text-sam-fg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
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
                  <PointChargeRequestList
                    requests={requests}
                    onCancel={(id) => {
                      if (cancelGuard.pending) return;
                      setCancelTarget(id);
                    }}
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
      </div>
      <PointFinancialDetailSheet item={selected} onClose={() => setSelected(null)} />
      <MobileConfirmBottomSheet
        open={cancelTarget != null}
        onCancel={() => setCancelTarget(null)}
        title={t("mypage_oa_charge_cancel_confirm_title")}
        description={t("mypage_oa_charge_cancel_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("points_ui_cancel_request")}
        confirmTone="danger"
        onConfirm={() => {
          const id = cancelTarget;
          setCancelTarget(null);
          if (id) void cancelGuard.run(() => cancelCharge(id));
        }}
      />
    </div>
  );
}
