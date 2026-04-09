"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";

type Props = {
  notificationUnreadCount?: number | null;
  backFallbackHref?: string;
  centerTitle?: string | null;
  centerSubtitle?: string | null;
};

/**
 * 내정보 허브 전용 — `MySubpageHeader`와 동일한 인스타형 헤더(뒤로·제목·알림·설정).
 * CTA 스트립은 프로필·탭에서 담당하므로 여기서는 숨깁니다.
 */
export function MyPageHeader({
  notificationUnreadCount,
  backFallbackHref = "/home",
  centerTitle,
  centerSubtitle,
}: Props) {
  return (
    <MySubpageHeader
      title={centerTitle?.trim() ? centerTitle.trim() : "내정보"}
      subtitle={centerSubtitle?.trim() ? centerSubtitle.trim() : undefined}
      backHref={backFallbackHref}
      preferHistoryBack
      hideCtaStrip
      showHubQuickActions
      notificationUnreadCount={notificationUnreadCount}
    />
  );
}
