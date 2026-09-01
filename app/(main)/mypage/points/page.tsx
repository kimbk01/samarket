"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { CurrencyAmount } from "@/components/currency";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import {
  PointFinancialDetailSheet,
  PointFinancialHistoryList,
} from "@/components/points/PointFinancialHistoryList";
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
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type Tab = PointFinancialFilter;

export default function MypagePointsPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypagePointsPageInner />
    </Suspense>
  );
}

function MypagePointsPageInner() {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = resolveCustomerCenterBackHref(from);
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "all";
  const showCharges = searchParams.get("view") === "charges";

  const [balance, setBalance] = useState(0);
  const [summary, setSummary] = useState<PointFinancialSummary | null>(null);
  const [items, setItems] = useState<PointFinancialHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<Tab>(
    initialTab === "credit" || initialTab === "debit" ? initialTab : "all"
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [selected, setSelected] = useState<PointFinancialHistoryItem | null>(null);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const qs = new URLSearchParams({
          filter: tab,
          limit: "30",
        });
        if (opts?.cursor) qs.set("cursor", opts.cursor);
        const res = await runSingleFlight(`me:points:fin:${tab}:${opts?.cursor ?? "0"}`, () =>
          fetch(`/api/me/points?${qs.toString()}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          balance?: number;
          summary?: PointFinancialSummary;
          history?: {
            items?: PointFinancialHistoryItem[];
            hasMore?: boolean;
            nextCursor?: string | null;
          };
          chargeRequests?: PointChargeRequest[];
          error?: string;
        };
        if (!res.ok || !json?.ok) {
          setLoadError(json?.error ?? "points_load_failed");
          if (!append) {
            setBalance(0);
            setItems([]);
            setRequests([]);
          }
          return;
        }
        setLoadError(null);
        setBalance(Math.max(0, Number(json.balance ?? 0)));
        setSummary(json.summary ?? null);
        const pageItems = Array.isArray(json.history?.items) ? json.history!.items! : [];
        setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
        setHasMore(Boolean(json.history?.hasMore));
        setNextCursor(json.history?.nextCursor ?? null);
        if (!append) {
          setRequests(Array.isArray(json.chargeRequests) ? json.chargeRequests : []);
        }
      } catch {
        setLoadError("points_load_failed");
        if (!append) {
          setBalance(0);
          setItems([]);
          setRequests([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const cancelCharge = async (id: string) => {
    if (cancelling) return;
    setCancelling(id);
    try {
      const res = await fetch(`/api/me/points/charge/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j.ok) await load();
    } finally {
      setCancelling(null);
    }
  };

  const tabs = useMemo(
    () =>
      [
        {
          id: "all" as const,
          label: safeT("point_fin_tab_all", { fallbackKo: "전체", fallbackEn: "All" }),
        },
        {
          id: "credit" as const,
          label: safeT("point_fin_tab_credit", { fallbackKo: "충전/지급", fallbackEn: "Credits" }),
        },
        {
          id: "debit" as const,
          label: safeT("point_fin_tab_debit", { fallbackKo: "사용/차감", fallbackEn: "Debits" }),
        },
      ] as const,
    [safeT]
  );

  const pendingCharges = requests.filter(
    (c) =>
      c.requestStatus === "pending" ||
      c.requestStatus === "waiting_confirm" ||
      c.requestStatus === "on_hold"
  ).length;

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
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} gap-5`}>
          {loadError ? (
            <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-700">
              {safeT("common_content_unavailable", {
                fallbackKo: "포인트 정보를 불러오지 못했습니다.",
                fallbackEn: "Could not load Point information.",
              })}
            </div>
          ) : null}

          <PointBalanceCard balance={balance} />

          <div className="flex flex-wrap gap-2">
            <Link
              href={withCustomerCenterFrom("/mypage/points/charge", from)}
              className="min-h-11 rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
            >
              {safeT("point_fin_cta_charge", { fallbackKo: "충전하기", fallbackEn: "Top up" })}
            </Link>
            <Link
              href={withCustomerCenterFrom("/mypage/points/promotions", from)}
              className="min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
            >
              {safeT("point_fin_cta_promotions", {
                fallbackKo: "홍보 권리",
                fallbackEn: "Promotions",
              })}
            </Link>
            <Link
              href={withCustomerCenterFrom("/mypage/points?view=charges", from)}
              className="min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
            >
              {safeT("point_fin_cta_charge_requests", {
                fallbackKo: pendingCharges > 0 ? `충전 신청 (${pendingCharges})` : "충전 신청",
                fallbackEn:
                  pendingCharges > 0 ? `Top-up requests (${pendingCharges})` : "Top-up requests",
              })}
            </Link>
          </div>

          {summary ? (
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

          {showCharges ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="sam-text-body font-semibold text-sam-fg">
                  {safeT("point_fin_charges_title", {
                    fallbackKo: "충전 신청 현황",
                    fallbackEn: "Top-up requests",
                  })}
                </h2>
                <Link
                  href={withCustomerCenterFrom("/mypage/points", from)}
                  className="sam-text-helper text-signature underline"
                >
                  {safeT("point_fin_back_history", {
                    fallbackKo: "사용 내역으로",
                    fallbackEn: "Back to history",
                  })}
                </Link>
              </div>
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
                  if (cancelling) return;
                  void cancelCharge(id);
                }}
              />
            </div>
          ) : (
            <>
              <div className="flex gap-0 border-b border-sam-border">
                {tabs.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`flex-1 py-3 sam-text-body-secondary font-semibold transition-colors ${
                      tab === id
                        ? "border-b-2 border-signature text-sam-fg"
                        : "text-sam-muted hover:text-sam-fg"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <PointFinancialHistoryList
                items={items}
                loading={loading}
                onSelect={setSelected}
              />

              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load({ append: true, cursor: nextCursor })}
                  className="min-h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50"
                >
                  {loadingMore
                    ? t("common_loading")
                    : safeT("point_fin_load_more", { fallbackKo: "더 보기", fallbackEn: "Load more" })}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <PointFinancialDetailSheet item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
