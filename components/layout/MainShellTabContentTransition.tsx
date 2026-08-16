"use client";

import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
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
 * CONTRACT — MAIN DOMAIN true push lives in AppRouteTransition (previous snapshot + live children).
 * DO NOT: InstantMainTabEnterPanel / temporary Feed enter panel here.
 * DO NOT: keep-alive multi-hub host that runs inactive URL sync (breaks bottom-nav).
 * pendingPushNode must stay null (no Instant Surface).
 */
export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  return (
    <AppRouteTransition contentStretchClass={contentStretchClass} overlay={null} pendingPushNode={null}>
      {children}
    </AppRouteTransition>
  );
}
