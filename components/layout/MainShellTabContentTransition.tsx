"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

const CommunityMessengerHomeShellSkeleton = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerRouteSkeletons").then(
      (m) => m.CommunityMessengerHomeShellSkeleton
    ),
  { ssr: false }
);
import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

type Props = {
  children: React.ReactNode;
  /** 하단 탭 서버 프라임과의 시그니처 호환 — 슬라이드 방향은 canonical pathname 만 사용 */
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  const { isPendingMenuBlockingContent, pendingMenuShellKind, pendingMenuIntent } = useLatestMenuNavigation();

  /**
   * 하단 탭은 `beginMenuNavigation` 직후 RSC 완료 전까지 스켈레톤을 전면에 올리면
   * “탭이 안 먹는다” 체감이 크다. 슬라이드만 두고 본문은 바로 그린다.
   */
  const blockMainShellWithPendingOverlay =
    isPendingMenuBlockingContent && pendingMenuIntent?.source !== "bottom-nav";

  const pendingRouteShell = useMemo(() => {
    if (!isPendingMenuBlockingContent) return null;
    if (pendingMenuShellKind === "messenger") {
      return <CommunityMessengerHomeShellSkeleton />;
    }
    return <MainFeedRouteLoading rows={5} />;
  }, [isPendingMenuBlockingContent, pendingMenuShellKind]);

  const pendingShell = blockMainShellWithPendingOverlay ? pendingRouteShell : null;
  const pendingPushNode =
    isPendingMenuBlockingContent && pendingMenuIntent?.source === "bottom-nav"
      ? pendingRouteShell
      : null;

  return (
    <AppRouteTransition
      contentStretchClass={contentStretchClass}
      overlay={pendingShell}
      pendingPushNode={pendingPushNode}
    >
      {children}
    </AppRouteTransition>
  );
}
