"use client";

import {
  fetchMeProfileDeduped,
  isMeProfileFullFetchSkippable,
} from "@/lib/profile/fetch-me-profile-deduped";

export function prewarmBottomNavMypageTab(): void {
  if (isMeProfileFullFetchSkippable()) return;
  void fetchMeProfileDeduped("bottom_nav_prewarm_mypage").catch(() => {
    /* mypage 프로필 prewarm 실패는 무시 */
  });
}
