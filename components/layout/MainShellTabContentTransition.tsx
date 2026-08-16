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
 * CONTRACT — Hub tab visual (product):
 * - History: replace (unchanged SSOT)
 * - Visual: NEW only enters right→left (`from-rtl` → `enter-rtl`)
 * - OLD does not translate (no TRUE PUSH)
 * - No frozen-DOM / body overlay clone (previous COVER approach abandoned)
 * Hub routes: single route `children` Surface only.
 * DO NOT: dual-panel Feed clone · KeepAlive multi-hub · View Transition · OLD exit translate
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
