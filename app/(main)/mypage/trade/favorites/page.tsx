"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FavoritesHubView } from "@/components/favorites/FavoritesHubView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeFavoritesPage() {
  const { t } = useI18n();
  return (
    <TradeHubSectionShell title={t("nav_trade_hub_favorites")}>
      <FavoritesHubView embedded />
    </TradeHubSectionShell>
  );
}
