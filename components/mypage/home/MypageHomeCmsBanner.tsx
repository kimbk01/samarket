"use client";

import { useState } from "react";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import type { MyPageBannerRow } from "@/lib/my/types";
import {
  isMypageBannerDismissed,
  rememberMypageBannerDismissed,
} from "@/lib/mypage/mypage-banner-dismissed";
import { pickMypageHomeBanner } from "@/lib/mypage/mypage-home-banner-pick";

/**
 * 내정보 홈 CMS 배너 (v2.1 PR-2c · §6 · 최종 설계 H0 1-b) — 관리자 `my_page_banners` 노출 배너 중
 * 닫지 않은 첫 1건을 프로필 블록(필수정보 포함) 바로 아래에 표시.
 * 데이터 = `GET /api/me/mypage-summary` 의 `banners` 필드(별도 Supabase 조회 없음).
 * 세션 스냅샷이 있으면 첫 렌더에 포함 → 늦게 끼어들며 메뉴를 밀어내는 흔들림·스크롤 복원 어긋남 제거.
 * 닫은 배너는 배너 id 단위로 기기에 저장 — 새 배너는 다시 보인다.
 * 광고 최종 점검: 서버가 목록을 주므로 닫으면 같은 자리에 다음 배너가 나온다.
 */
export function MypageHomeCmsBanner({ banners }: { banners: readonly MyPageBannerRow[] }) {
  const [dismissedIds, setDismissedIds] = useState<readonly string[]>([]);

  const banner = pickMypageHomeBanner(
    banners,
    (id) => dismissedIds.includes(id) || isMypageBannerDismissed(id)
  );
  if (!banner) return null;
  return (
    <MyTopBanner
      key={banner.id}
      banner={banner}
      onDismiss={() => {
        rememberMypageBannerDismissed(banner.id);
        setDismissedIds((prev) => (prev.includes(banner.id) ? prev : [...prev, banner.id]));
      }}
    />
  );
}
