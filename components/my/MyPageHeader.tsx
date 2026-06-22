"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyMypageHeaderActions } from "@/components/my/MyMypageHeaderActions";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  backFallbackHref?: string;
  centerTitle?: string | null;
  centerTitleKey?: MessageKey;
  centerSubtitle?: string | null;
};

/** 내정보 홈 헤더 — 알림만(설정 홈은 내정보 메뉴에 통합), sheet 없음 */
export function MyPageHeader({
  backFallbackHref = "/philife",
  centerTitle,
  centerTitleKey = "mypage_comp_myinfo_header_title_default",
  centerSubtitle,
}: Props) {
  const trimmedTitle = centerTitle?.trim();
  return (
    <MySubpageHeader
      titleKey={trimmedTitle ? undefined : centerTitleKey}
      title={trimmedTitle || undefined}
      subtitle={centerSubtitle?.trim() ? centerSubtitle.trim() : undefined}
      backHref={backFallbackHref}
      preferHistoryBack
      hideCtaStrip
      rightSlot={<MyMypageHeaderActions />}
    />
  );
}
