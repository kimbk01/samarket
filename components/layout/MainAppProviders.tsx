"use client";

import type { ReactNode } from "react";
import { MainAppProviderTree } from "@/components/layout/MainAppProviderTree";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

/**
 * `(main)` 전역 클라이언트 Provider 스택 — 실제 트리는 `MainAppProviderTree`.
 *
 * 순서(바깥 → 안쪽): 지역 → 세션/주소 게이트 → 찜·알림 표면 → 글쓰기/카테고리 헤더 → 매장 카트
 * → 1단 크롬 → 거래 presence → 앱 타이틀·스티키 헤더·페이지 셸.
 * 통화 표면/수신 오버레이·알림 realtime 크롬은 `ConditionalAppShell` 내 `CallIncomingChrome`·`MessagingGlobalChrome` 에서 경로 기준으로만 마운트.
 *
 * - 여기서 `getUser()` 등 **서버 세션 재검증을 추가하지 않는다** — `proxy.ts`·API 단일 경로와
 *   로그인 직후 쿠키 레이스를 망가뜨릴 수 있음(`app/(main)/layout.tsx` 주석과 동일).
 * - 새 Provider 는 **정말 전역**일 때만 추가하고, 화면 전용 상태는 해당 라우트·feature 쪽으로 둔다.
 */
export function MainAppProviders({
  children,
  initialMainBottomNavItems = null,
  initialTradeTabCategories = null,
}: {
  children: ReactNode;
  initialMainBottomNavItems?: BottomNavItemConfig[] | null;
  /**
   * RSC `(main)/layout` — `queryTradeHomeRootCategories` 와 동일 열. `<AppStickyHeader />` 가
   * `children`보다 먼저 그려지므로, 동기 프라임(`TradeTabCategoriesServerPrime`)으로 클라 2nd 페치 대기를 제거.
   */
  initialTradeTabCategories?: CategoryWithSettings[] | null;
}) {
  return (
    <MainAppProviderTree
      initialMainBottomNavItems={initialMainBottomNavItems}
      initialTradeTabCategories={initialTradeTabCategories}
    >
      {children}
    </MainAppProviderTree>
  );
}
