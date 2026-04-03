"use client";

import {
  useRegisterCategoryListStickyHeader,
  useRegisterTradeSecondaryTabs,
} from "@/contexts/CategoryListHeaderContext";

/**
 * `/market/...` 피드 → `/post/:id` 로 올 때 `CategoryListSubheader`·2단 탭 설정이
 * 컨텍스트에 남아 전역 헤더가 이중으로 보이는 경우 방지.
 */
export function PostDetailFeedChromeReset() {
  useRegisterCategoryListStickyHeader(false, "", null);
  useRegisterTradeSecondaryTabs(false, null);
  return null;
}
