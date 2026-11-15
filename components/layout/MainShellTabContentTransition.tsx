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
 * 셸 본문 전환 호스트 (`AppRouteTransition` 래퍼).
 *
 * 하단 탭 이동은 이 호스트가 연출하지 않는다 — 계약 v2(`lib/main-menu/main-bottom-nav-interaction-contract.ts`,
 * Owner 2026-11-15 「네이버형」): 손 뗀 프레임에 하단 탭 컨트롤러가 보관 화면·뼈대로 바꾸고, 경로 확정 때
 * `AppRouteTransition` 은 하단 탭 출처를 즉시 끝낸다(슬라이드 없음). 허브 화면 보관 = `HubRetentionStack`.
 * 링크·뒤로가기·내정보 스택·배달 스택·통화 화면 연출은 각자 기존 계약 그대로.
 * Header + Body 는 한 surface, BottomNav 는 surface 밖 고정.
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
