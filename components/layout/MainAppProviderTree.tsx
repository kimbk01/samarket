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
import { TradePresenceActivityProvider } from "@/components/chats/TradePresenceActivityContext";
import { TradeChatEntryCreatingOverlay } from "@/components/chats/TradeChatEntryCreatingOverlay";

/**
 * Provider JSX 전용 — `MainAppProviders` 와 분리해 트리·순서를 한 파일에서 보존하고,
 * 이후 경로별 지연 로드·스플릿 시 경계를 잡기 쉽게 한다.
 *
 * 통화 표면(`CallProvider`)·수신 오버레이는 `ConditionalAppShell` 경로 게이트 안의
 * `CallIncomingChrome` 으로만 올린다. 알림/메신저 unread 브리지는 `MessagingGlobalChrome`.
 */
export function MainAppProviderTree({ children }: { children: ReactNode }) {
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
                  <TradePresenceActivityProvider>
                    <AppTitle />
                    <AppStickyHeader />
                    <ConditionalAppShell regionBarInLayout={true}>{children}</ConditionalAppShell>
                    <TradeChatEntryCreatingOverlay />
                  </TradePresenceActivityProvider>
                </MainTier1ChromeProvider>
              </StoreCommerceCartProvider>
            </CategoryListHeaderProvider>
          </WriteCategoryProvider>
        </NotificationSurfaceProvider>
      </FavoriteProvider>
    </RegionProvider>
  );
}
