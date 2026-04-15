"use client";

import type { ReactNode } from "react";
import { SessionLostRedirect } from "@/components/auth/SessionLostRedirect";
import { MandatoryAddressGate } from "@/components/addresses/MandatoryAddressGate";
import { ConditionalAppShell } from "@/components/layout/ConditionalAppShell";
import { AppStickyHeader } from "@/components/layout/AppStickyHeader";
import { AppTitle } from "@/components/layout/AppTitle";
import { MainTier1ChromeProvider } from "@/components/layout/MainTier1ChromeProvider";
import { CategoryListHeaderProvider } from "@/contexts/CategoryListHeaderContext";
import { FavoriteProvider } from "@/contexts/FavoriteContext";
import { RegionProvider } from "@/contexts/RegionContext";
import { StoreCommerceCartProvider } from "@/contexts/StoreCommerceCartContext";
import { WriteCategoryProvider } from "@/contexts/WriteCategoryContext";
import { NotificationSurfaceProvider } from "@/contexts/NotificationSurfaceContext";

/**
 * `(main)` 전역 클라이언트 Provider 스택 — 한 컴포넌트에 모아 순서·책임을 고정한다.
 *
 * 순서(바깥 → 안쪽): 지역 → 세션/주소 게이트 → 찜·알림 표면 → 글쓰기/카테고리 헤더 → 매장 카트
 * → 1단 크롬 → 앱 타이틀·스티키 헤더·페이지 셸.
 *
 * - 여기서 `getUser()` 등 **서버 세션 재검증을 추가하지 않는다** — `proxy.ts`·API 단일 경로와
 *   로그인 직후 쿠키 레이스를 망가뜨릴 수 있음(`app/(main)/layout.tsx` 주석과 동일).
 * - 새 Provider 는 **정말 전역**일 때만 추가하고, 화면 전용 상태는 해당 라우트·feature 쪽으로 둔다.
 */
export function MainAppProviders({ children }: { children: ReactNode }) {
  return (
    <RegionProvider>
      <SessionLostRedirect />
      <MandatoryAddressGate />
      <FavoriteProvider>
        <NotificationSurfaceProvider>
          <WriteCategoryProvider>
            <CategoryListHeaderProvider>
              <StoreCommerceCartProvider>
                <MainTier1ChromeProvider>
                  <AppTitle />
                  <AppStickyHeader />
                  <ConditionalAppShell regionBarInLayout={true}>{children}</ConditionalAppShell>
                </MainTier1ChromeProvider>
              </StoreCommerceCartProvider>
            </CategoryListHeaderProvider>
          </WriteCategoryProvider>
        </NotificationSurfaceProvider>
      </FavoriteProvider>
    </RegionProvider>
  );
}
