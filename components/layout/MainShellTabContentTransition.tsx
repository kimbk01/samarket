"use client";

import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
import { MainTabSurfaceKeepAlive } from "@/components/layout/MainTabSurfaceKeepAlive";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

type Props = {
  children: React.ReactNode;
  /** 하단 탭 서버 프라임과의 시그니처 호환 — 슬라이드 방향은 canonical pathname 만 사용 */
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

/**
 * Bottom-nav transition host.
 *
 * CONTRACT — Single Surface Authority:
 * - Hub Surfaces live in `MainTabSurfaceKeepAlive` (one instance each).
 * - DO NOT: InstantMainTabEnterPanel / pendingPushNode temporary Feed·List entry.
 * - DO NOT: dual-panel temporary Surface that remounts on route commit.
 * Transition layer = presentation/navigation only; Surface creation = keep-alive.
 */
export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  return (
    <AppRouteTransition contentStretchClass={contentStretchClass} overlay={null} pendingPushNode={null}>
      <MainTabSurfaceKeepAlive>{children}</MainTabSurfaceKeepAlive>
    </AppRouteTransition>
  );
}
