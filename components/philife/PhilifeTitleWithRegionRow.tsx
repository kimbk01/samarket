"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1ExplorationTitleRow } from "@/components/layout/Tier1ExplorationTitleRow";
import { BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY } from "@/lib/main-menu/bottom-nav-config";

/**
 * 필라이프 상단 한 줄 — 하단 탭 라벨 · 지역 한 줄, 탭 시 `/mypage/addresses`.
 */
export function PhilifeTitleWithRegionRow() {
  const { t } = useI18n();
  return <Tier1ExplorationTitleRow segmentTitle={t(BOTTOM_NAV_PHILIFE_TAB_LABEL_KEY)} />;
}
