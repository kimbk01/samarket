"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { FavoriteStoresView } from "@/components/favorites/FavoriteStoresView";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import {
  FAVORITES_HUB_SEGMENTS,
  type FavoritesHubSegmentId,
} from "@/lib/mypage/favorites-hub-segments";
import { useMyFavoriteCount } from "@/hooks/useMyFavoriteCount";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";

const SEGMENT_IDS = FAVORITES_HUB_SEGMENTS.map((s) => s.id) as readonly FavoritesHubSegmentId[];

/**
 * 찜 허브 — 1단 중고거래|스토어(`?fav=trade|store`, 기존 키 유지 X17), 2단(거래) 칩은 FavoriteProductsView 내부(`?chip=`).
 * 탭 전환은 `history.replaceState`(뒤로가기 기록 없음) — 공유 링크 `?fav=store` 그대로 진입.
 */
export function FavoritesHubView({
  embedded = false,
  initialSegment,
}: {
  embedded?: boolean;
  initialSegment?: FavoritesHubSegmentId;
} = {}) {
  const { t } = useI18n();
  const [urlSegment, setUrlSegment] = useMypageTabParam<FavoritesHubSegmentId>({
    key: "fav",
    values: SEGMENT_IDS,
    defaultValue: "trade",
  });
  const [localSegment, setLocalSegment] = useState<FavoritesHubSegmentId | null>(initialSegment ?? null);
  const segment = localSegment ?? urlSegment;
  const setSegment = (next: FavoritesHubSegmentId) => {
    if (localSegment != null) setLocalSegment(next);
    else setUrlSegment(next);
  };
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
        <FavoriteProductsView embedded hideOuterPadding syncUrl={localSegment == null} />
      )}
    </div>
  );
}
