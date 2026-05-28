"use client";

import { useMemo } from "react";

import { AppRouteTransition } from "@/components/route-transition/AppRouteTransition";
import { TradeMarketTabPushEnterPanel } from "@/components/market/TradeMarketTabPushEnterPanel";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

type Props = {
  children: React.ReactNode;
  /** 하단 탭 서버 프라임과의 시그니처 호환 — 슬라이드 방향은 canonical pathname 만 사용 */
  initialNavItems?: BottomNavItemConfig[] | null;
  /** `ConditionalAppShell` 채팅 상세 등에서 본문 컬럼과 동일한 flex 연장 */
  contentStretchClass?: string;
};

function isMarketMenuIntentPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").trim();
  return p === "/market" || p.startsWith("/market/");
}

export function MainShellTabContentTransition({
  children,
  initialNavItems: _initialNavItems = null,
  contentStretchClass = "min-w-0",
}: Props) {
  void _initialNavItems;

  const { isPendingMenuBlockingContent, pendingMenuIntent } = useLatestMenuNavigation();

  /** 메인 메뉴 이동 전체: RSC 대기 중 전면/push 스켈레톤 금지. */
  const pendingShell = null;
  const pendingPushNode = useMemo(() => {
    if (!isPendingMenuBlockingContent || !pendingMenuIntent) return null;
    if (pendingMenuIntent.source === "trade-primary" || isMarketMenuIntentPath(pendingMenuIntent.pathname)) {
      return <TradeMarketTabPushEnterPanel href={pendingMenuIntent.href} />;
    }
    return null;
  }, [isPendingMenuBlockingContent, pendingMenuIntent]);

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
