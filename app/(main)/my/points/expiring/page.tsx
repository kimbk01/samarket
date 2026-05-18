"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointExpireList } from "@/components/points/PointExpireList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointLedgerEntry } from "@/lib/types/point";

export default function MyPointsExpiringPage() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "";
  const balance = 0;
  const entries = useMemo<PointLedgerEntry[]>(() => [], []);
  const summary = useMemo(
    () => ({
      userId,
      ...getUpcomingExpiringSummary(userId, entries),
    }),
    [userId, entries],
  );

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_expiring_title")}
        subtitle={t("mypage_points_expiring_subtitle")}
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          {t("mypage_points_expiring_notice")}
        </div>
        <PointBalanceCard balance={balance} />
        <PointExpiringCard summary={summary} />
        <PointExpireList expiringEntries={[]} expiredEntries={[]} />
      </div>
    </div>
  );
}
