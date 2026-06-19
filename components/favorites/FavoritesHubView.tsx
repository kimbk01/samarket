"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { FavoriteStoresView } from "@/components/favorites/FavoriteStoresView";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import {
  FAVORITES_HUB_SEGMENTS,
  type FavoritesHubSegmentId,
} from "@/lib/mypage/favorites-hub-segments";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";

function parseSegment(raw: string | null): FavoritesHubSegmentId {
  return raw === "store" ? "store" : "trade";
}

/**
 * 찜 허브 — 1단 중고거래|스토어, 2단(거래) 판매중/완료 탭은 FavoriteProductsView 내부
 */
export function FavoritesHubView({
  embedded = false,
  initialSegment,
}: {
  embedded?: boolean;
  initialSegment?: FavoritesHubSegmentId;
} = {}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const querySegment = parseSegment(searchParams?.get("fav") ?? null);
  const [segment, setSegment] = useState<FavoritesHubSegmentId>(
    initialSegment ?? querySegment
  );
  const { tradeCount, storeCount } = useMyFavoriteCount();

  const segmentCounts = useMemo(
    (): Record<FavoritesHubSegmentId, number> => ({
      trade: tradeCount ?? 0,
      store: storeCount ?? 0,
    }),
    [tradeCount, storeCount]
  );

  const segmentTabs = useMemo(
    () =>
      FAVORITES_HUB_SEGMENTS.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        labelKey: item.labelKey,
      })),
    [t]
  );

  return (
    <div className={embedded ? "flex flex-col gap-2" : "mx-auto flex max-w-lg flex-col gap-2 px-4 py-3 pb-24"}>
      <TradeManagementTabBar
        tabs={segmentTabs}
        active={segment}
        counts={segmentCounts}
        onChange={setSegment}
      />
      {segment === "store" ? (
        <FavoriteStoresView embedded />
      ) : (
        <FavoriteProductsView embedded hideOuterPadding />
      )}
    </div>
  );
}
