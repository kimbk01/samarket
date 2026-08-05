"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";

function PointsBackendNotice() {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-emerald-100 bg-emerald-50 px-4 py-3 sam-text-body-secondary text-emerald-900">
      {t("points_backend_notice")}
    </div>
  );
}

function PointsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 rounded-ui-rect bg-sam-surface shadow-sm ring-1 ring-black/[0.06]" />
      <div className="h-20 rounded-ui-rect bg-sam-surface shadow-sm ring-1 ring-black/[0.06]" />
      <div className="h-40 rounded-ui-rect bg-sam-surface shadow-sm ring-1 ring-black/[0.06]" />
    </div>
  );
}

export default function MypagePointsPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypagePointsPageInner />
    </Suspense>
  );
}

function MypagePointsPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const backHref = resolveCustomerCenterBackHref(searchParams.get("from"));
  const userId = getCurrentUser()?.id ?? "";
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<PointLedgerEntry[]>([]);
  const [requests, setRequests] = useState<PointChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const res = await runSingleFlight("me:points:get", () =>
          fetch("/api/me/points", {
            credentials: "include",
            cache: "no-store",
          })
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          balance?: unknown;
          ledger?: PointLedgerEntry[];
          chargeRequests?: PointChargeRequest[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setLoadError(json?.error ?? "points_load_failed");
          setBalance(0);
          setLedgerEntries([]);
          setRequests([]);
          return;
        }
        setLoadError(null);
        setBalance(Math.max(0, Number(json.balance ?? 0)));
        setLedgerEntries(Array.isArray(json.ledger) ? json.ledger : []);
        setRequests(Array.isArray(json.chargeRequests) ? json.chargeRequests : []);
      } catch {
        if (cancelled) return;
        setLoadError("points_load_failed");
        setBalance(0);
        setLedgerEntries([]);
        setRequests([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const expiringSummary = useMemo(
    () => ({
      userId,
      ...getUpcomingExpiringSummary(userId, ledgerEntries),
    }),
    [userId, ledgerEntries]
  );

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("common_points")}
        subtitle={t("points_subtitle")}
        backHref={backHref}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-6 py-4">
        <PointsBackendNotice />
        {loadError ? (
          <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-700">
            포인트 정보를 불러오지 못했습니다.
          </div>
        ) : null}
        {loading ? (
          <PointsLoadingSkeleton />
        ) : (
          <>
            <PointBalanceCard balance={balance} />
            <PointExpiringCard summary={expiringSummary} />
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/mypage/points/charge"
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
          >
            {t("points_charge")}
          </Link>
          <Link
            href="/mypage/points/ledger"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("points_ledger")}
          </Link>
          <Link
            href="/mypage/points/promotions"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("points_promotion")}
          </Link>
          <Link
            href="/mypage/points/expiring"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
          >
            {t("points_expiring")}
          </Link>
        </div>
        <div>
          <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("points_charge_history")}</h2>
          {loading ? (
            <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
          ) : (
            <PointChargeRequestList requests={requests} />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
