"use client";

import { useMemo } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyMypageHeaderActions } from "@/components/my/MyMypageHeaderActions";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveMypageBackFallbackHref } from "@/lib/main-menu/mypage-bottom-nav-origin";

type Props = {
  backFallbackHref?: string;
  centerTitle?: string | null;
  centerTitleKey?: MessageKey;
  centerSubtitle?: string | null;
  /** 비로그인(로그인 화면) — 알림 종 없음 */
  hideActions?: boolean;
};

/** 내정보 홈 헤더 — 알림만(설정 홈은 내정보 메뉴에 통합), sheet 없음 */
export function MyPageHeader({
  backFallbackHref,
  centerTitle,
  centerTitleKey = "mypage_comp_myinfo_header_title_default",
  centerSubtitle,
  hideActions = false,
}: Props) {
  const trimmedTitle = centerTitle?.trim();
  const resolvedBackHref = useMemo(
    () => backFallbackHref ?? resolveMypageBackFallbackHref(),
    [backFallbackHref]
  );
  return (
    <MySubpageHeader
      titleKey={trimmedTitle ? undefined : centerTitleKey}
      title={trimmedTitle || undefined}
      subtitle={centerSubtitle?.trim() ? centerSubtitle.trim() : undefined}
      backHref={resolvedBackHref}
      preferHistoryBack={false}
      hideCtaStrip
      // 메인 허브 헤더는 rightSlot 이 비면 알림 종을 기본으로 그린다 — 비로그인은 빈 칸을 명시
      rightSlot={hideActions ? <span aria-hidden data-mypage-guest-no-actions /> : <MyMypageHeaderActions />}
    />
  );
}
