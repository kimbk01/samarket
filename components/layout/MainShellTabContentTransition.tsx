"use client";

import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import type { ReactNode } from "react";

type Props = {
  children: React.ReactNode;
  /** 하단 탭 서버 프라임과의 시그니처 호환 — 슬라이드 방향은 canonical pathname 만 사용 */
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
  /**
   * MAIN hub: Header slot rendered **inside** the single push surface
   * (ONE transform authority with body). Null on non-hub shells.
   */
  hubChromeHeader?: ReactNode;
};

/**
 * Bottom-nav transition host.
 *
 * CONTRACT — MAIN hub shell transition (product):
 * - History: replace (unchanged SSOT)
 * - START: BottomNav MAIN intent → transition (pathname is settle only)
 * - Visual: Header + Body = ONE transform surface; BottomNav fixed
 * - Duration: 440ms (`MAIN_SHELL_ROUTE_TRANSITION_MS`)
 * - OLD does not translate (no TRUE PUSH)
 * - No frozen-DOM / body overlay clone (COVER abandoned)
 * Hub routes: single route `children` Surface only.
 * DO NOT: dual-panel Feed clone · KeepAlive multi-hub · View Transition · OLD exit translate
 * DO NOT: separate header/body animations
 * EXCEPTION (설계서 §12 「전환 중」): 내정보 스택 kind(`mypage-stack-forward/back`)만 헤더 고정 + 본문 슬라이드
 *   — `AppRouteTransition` `data-mypage-stack-header-fixed` (메인 허브·다른 도메인 전환은 위 계약 그대로)
 */
export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
  hubChromeHeader = null,
}: Props) {
  void _initialNavItems;

  return (
    <AppRouteTransition
      contentStretchClass={contentStretchClass}
      overlay={null}
      pendingPushNode={null}
      hubChromeHeader={hubChromeHeader}
    >
      {children}
    </AppRouteTransition>
  );
}
