"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  backFallbackHref?: string;
  /** 레거시 문자열 제목 — `centerTitleKey` 가 있으면 무시 */
  centerTitle?: string | null;
  /** i18n dot key (기본: 내정보) */
  centerTitleKey?: MessageKey;
  centerSubtitle?: string | null;
};

/**
 * 내정보 허브 전용 — `MySubpageHeader`와 동일한 인스타형 헤더(뒤로·제목·알림음·설정).
 * CTA 스트립은 프로필·탭에서 담당하므로 여기서는 숨깁니다.
 */
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
      showHubQuickActions
    />
  );
}
