"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";

function PointsBackendNotice() {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      {t("points_backend_notice")}
    </div>
  );
}

export default function MypagePointsPage() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "";
  const balance = 0;
  const ledgerEntries = useMemo<PointLedgerEntry[]>(() => [], []);
  const expiringSummary = useMemo(
    () => ({
      userId,
      ...getUpcomingExpiringSummary(userId, ledgerEntries),
    }),
    [userId, ledgerEntries]
  );
  const requests = useMemo<PointChargeRequest[]>(() => [], []);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("common_points")}
        subtitle={t("points_subtitle")}
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <PointsBackendNotice />
        <PointBalanceCard balance={balance} />
        <PointExpiringCard summary={expiringSummary} />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/my/points/charge"
            className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white"
          >
            {t("points_charge")}
          </Link>
          <Link
            href="/my/points/ledger"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_ledger")}
          </Link>
          <Link
            href="/my/points/promotions"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_promotion")}
          </Link>
          <Link
            href="/my/points/expiring"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            {t("points_expiring")}
          </Link>
        </div>
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">{t("points_charge_history")}</h2>
          <PointChargeRequestList requests={requests} />
        </div>
      </div>
    </div>
  );
}
