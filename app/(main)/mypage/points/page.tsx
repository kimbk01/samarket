"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

function PointsBackendNotice() {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
      {t("points_backend_notice")}
    </div>
  );
}

function PointsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 rounded-ui-rect bg-white shadow-sm ring-1 ring-black/[0.06]" />
      <div className="h-20 rounded-ui-rect bg-white shadow-sm ring-1 ring-black/[0.06]" />
      <div className="h-40 rounded-ui-rect bg-white shadow-sm ring-1 ring-black/[0.06]" />
    </div>
  );
}

export default function MypagePointsPage() {
  const { t } = useI18n();
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
        const res = await fetch("/api/me/points", {
          credentials: "include",
          cache: "no-store",
        });
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
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("common_points")}
        subtitle={t("points_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} space-y-6 py-4`}>
        <PointsBackendNotice />
        {loadError ? (
          <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
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
            href="/my/points/charge"
            className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white"
          >
            {t("points_charge")}
          </Link>
          <Link
            href="/my/points/ledger"
            className="rounded-ui-rect border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_ledger")}
          </Link>
          <Link
            href="/my/points/promotions"
            className="rounded-ui-rect border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_promotion")}
          </Link>
          <Link
            href="/my/points/expiring"
            className="rounded-ui-rect border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_expiring")}
          </Link>
        </div>
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">{t("points_charge_history")}</h2>
          {loading ? (
            <div className="rounded-ui-rect bg-white p-8 text-center text-[14px] text-gray-500">불러오는 중…</div>
          ) : (
            <PointChargeRequestList requests={requests} />
          )}
        </div>
      </div>
    </div>
  );
}
