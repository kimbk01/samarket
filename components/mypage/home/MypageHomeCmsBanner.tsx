"use client";

import { useState } from "react";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import type { MyPageBannerRow } from "@/lib/my/types";
import {
  isMypageBannerDismissed,
  rememberMypageBannerDismissed,
} from "@/lib/mypage/mypage-banner-dismissed";

/**
 * 내정보 홈 CMS 배너 (v2.1 PR-2c · §6 · 최종 설계 H0 1-b) — 관리자 `my_page_banners` 활성 1건을
 * 프로필 블록(필수정보 포함) 바로 아래에 표시.
 * 데이터 = `GET /api/me/mypage-summary` 의 `banner` 필드(별도 Supabase 조회 없음).
 * 세션 스냅샷이 있으면 첫 렌더에 포함 → 늦게 끼어들며 메뉴를 밀어내는 흔들림·스크롤 복원 어긋남 제거.
 * 닫은 배너는 배너 id 단위로 기기에 저장 — 새 배너는 다시 보인다.
 */
export function MypageHomeCmsBanner({ banner }: { banner: MyPageBannerRow | null }) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (!banner) return null;
  if (dismissedId === banner.id) return null;
  if (banner.dismissible && isMypageBannerDismissed(banner.id)) return null;
  return (
    <MyTopBanner
      banner={banner}
      onDismiss={() => {
        rememberMypageBannerDismissed(banner.id);
        setDismissedId(banner.id);
      }}
    />
  );
}
