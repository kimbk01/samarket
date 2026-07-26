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
 * - `MainTabSurfaceKeepAlive` wraps (outside) `AppRouteTransition` so push/panel
 *   swaps cannot remount hub Surfaces.
 * - DO NOT: InstantMainTabEnterPanel / pendingPushNode temporary Feed·List entry.
 * - DO NOT: nest KeepAlive under dual-panel entering/exiting nodes.
 */
export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  return (
    <div className={contentStretchClass || "min-w-0"}>
      <MainTabSurfaceKeepAlive>
        <AppRouteTransition
          contentStretchClass="main-shell-push-host flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          overlay={null}
          pendingPushNode={null}
        >
          {children}
        </AppRouteTransition>
      </MainTabSurfaceKeepAlive>
    </div>
  );
}
