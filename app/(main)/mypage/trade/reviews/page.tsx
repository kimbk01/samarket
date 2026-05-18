"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeReviewsPage() {
  const { t } = useI18n();
  return (
    <TradeHubSectionShell title={t("nav_trade_reviews")}>
      <TradeReviewsManagementView />
    </TradeHubSectionShell>
  );
}
