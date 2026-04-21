"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { bumpAppWidePerf, recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { SessionLostRedirect } from "@/components/auth/SessionLostRedirect";
import { MandatoryAddressGate } from "@/components/addresses/MandatoryAddressGate";
import { ConditionalAppShell } from "@/components/layout/ConditionalAppShell";
import { AppStickyHeader } from "@/components/layout/AppStickyHeader";
import { OwnerHubBadgeRuntime } from "@/components/layout/OwnerHubBadgeRuntime";
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
import { MainShellMessengerParticipantBridge } from "@/components/layout/MainShellMessengerParticipantBridge";
import { MessengerBootstrapEarlyWarm } from "@/components/community-messenger/MessengerBootstrapEarlyWarm";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

/** 매장·마이(재주문 등)에서만 장바구니 컨텍스트 마운트 — `/home` 등에서는 localStorage hydrate effect 비용 생략 */
function StoreCommerceCartMaybeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const mountCart = pathname.startsWith("/stores") || pathname.startsWith("/mypage");
  if (!mountCart) {
    return <>{children}</>;
  }
  return <StoreCommerceCartProvider>{children}</StoreCommerceCartProvider>;
}

function AppWideRuntimePerfHooks() {
  const bootstrapRafRef = useRef<{ a: number; b: number }>({ a: 0, b: 0 });
  useEffect(() => {
    bumpAppWidePerf("app_bootstrap_start");
    const t0 = performance.now();
    bootstrapRafRef.current.a = requestAnimationFrame(() => {
      bootstrapRafRef.current.b = requestAnimationFrame(() => {
        bumpAppWidePerf("app_bootstrap_success");
        recordAppWidePhaseLastMs("app_bootstrap_ms", Math.round(performance.now() - t0));
      });
    });
    return () => {
      cancelAnimationFrame(bootstrapRafRef.current.a);
      cancelAnimationFrame(bootstrapRafRef.current.b);
    };
  }, []);

  const pathname = usePathname() ?? "";
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      bumpAppWidePerf("route_reenter");
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        bumpAppWidePerf("visibility_resume");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return null;
}

/**
 * Provider JSX 전용 — `MainAppProviders` 와 분리해 트리·순서를 한 파일에서 보존하고,
 * 이후 경로별 지연 로드·스플릿 시 경계를 잡기 쉽게 한다.
 *
 * 통화 표면(`CallProvider`)·수신 오버레이는 `ConditionalAppShell` 경로 게이트 안의
 * `CallIncomingChrome` 으로만 올린다. 알림/메신저 unread 브리지는 `MessagingGlobalChrome`.
 */
export function MainAppProviderTree({
  children,
  initialMainBottomNavItems = null,
}: {
  children: ReactNode;
  initialMainBottomNavItems?: BottomNavItemConfig[] | null;
}) {
  return (
    <RegionProvider>
      <AppWideRuntimePerfHooks />
      <SessionLostRedirect />
      <MessengerBootstrapEarlyWarm />
      <OwnerHubBadgeRuntime />
      <MandatoryAddressGate />
      <FavoriteProvider>
        <NotificationSurfaceProvider>
          <MainShellMessengerParticipantBridge regionBarInLayout={true} />
          <WriteCategoryProvider>
            <CategoryListHeaderProvider>
              <StoreCommerceCartMaybeProvider>
                <MainTier1ChromeProvider>
                  <TradePresenceActivityProvider>
                    <AppTitle />
                    <AppStickyHeader />
                    <ConditionalAppShell
                      regionBarInLayout={true}
                      initialMainBottomNavItems={initialMainBottomNavItems}
                    >
                      {children}
                    </ConditionalAppShell>
                    <TradeChatEntryCreatingOverlay />
                  </TradePresenceActivityProvider>
                </MainTier1ChromeProvider>
              </StoreCommerceCartMaybeProvider>
            </CategoryListHeaderProvider>
          </WriteCategoryProvider>
        </NotificationSurfaceProvider>
      </FavoriteProvider>
    </RegionProvider>
  );
}
