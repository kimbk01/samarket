"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointLedgerList } from "@/components/points/PointLedgerList";
import type { PointLedgerEntry } from "@/lib/types/point";

export default function MyPointsLedgerPage() {
  const { t } = useI18n();
  const balance = 0;
  const entries = useMemo<PointLedgerEntry[]>(() => [], []);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_ledger_title")}
        subtitle={t("mypage_points_ledger_subtitle")}
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          {t("mypage_points_ledger_notice")}
        </div>
        <PointBalanceCard balance={balance} />
        <PointLedgerList entries={entries} />
      </div>
    </div>
  );
}
