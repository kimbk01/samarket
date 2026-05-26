"use client";

import { fetchMeProfileDeduped, isMeProfileCacheFresh } from "@/lib/profile/fetch-me-profile-deduped";

export function prewarmBottomNavMypageTab(): void {
  if (isMeProfileCacheFresh()) return;
  void fetchMeProfileDeduped().catch(() => {
    /* mypage 프로필 prewarm 실패는 무시 */
  });
}
