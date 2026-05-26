"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { StoreCommerceCartRuntimeBoundary } from "@/components/layout/providers/StoreCommerceCartRuntimeBoundary";
import { bumpAppWidePerf, recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";
import { SessionLostRedirect } from "@/components/auth/SessionLostRedirect";
import { AuthComplianceRedirect } from "@/components/auth/AuthComplianceRedirect";
import { MandatoryAddressGate } from "@/components/addresses/MandatoryAddressGate";
import { PhoneVerificationRequiredDialog } from "@/components/auth/PhoneVerificationRequiredDialog";
import { ConditionalAppShell } from "@/components/layout/ConditionalAppShell";
import { OwnerHubBadgeRuntime } from "@/components/layout/OwnerHubBadgeRuntime";
import { MainTier1ChromeProvider } from "@/components/layout/MainTier1ChromeProvider";
import { MypageInfoHubPanelProvider, useMypageInfoHubPanel } from "@/contexts/MypageInfoHubPanelContext";
import { CategoryListHeaderProvider } from "@/contexts/CategoryListHeaderContext";
import { FavoriteProvider } from "@/contexts/FavoriteContext";
import { RegionProvider } from "@/contexts/RegionContext";
import { WriteCategoryProvider } from "@/contexts/WriteCategoryContext";
import { NotificationSurfaceProvider } from "@/contexts/NotificationSurfaceContext";
import { TradePresenceActivityProvider } from "@/components/chats/TradePresenceActivityContext";
import { MainAppHeaderStackWrap } from "@/components/layout/MainAppHeaderStackWrap";
import { PhilifeHeaderMessengerStackProvider } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { TradeHeaderTradeHistoryStackProvider } from "@/contexts/TradeHeaderTradeHistoryStackContext";
import { PhilifeWriteSheetProvider } from "@/contexts/PhilifeWriteSheetContext";
import { TradeWriteSheetProvider } from "@/contexts/TradeWriteSheetContext";
import { TradeTabCategoriesServerPrime } from "@/components/layout/TradeTabCategoriesServerPrime";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { LatestMenuNavigationProvider } from "@/contexts/LatestMenuNavigationContext";
import { MainBottomNavTabsProvider } from "@/contexts/MainBottomNavTabsContext";
import { DiBaYNotificationOnboardingGate } from "@/components/notifications/DiBaYNotificationOnboardingGate";
import { DevicePermissionUiHost } from "@/components/permissions/DevicePermissionUiHost";
import { IncomingCallOverlayChunkBoundary } from "@/components/layout/providers/IncomingCallOverlayChunkBoundary";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import { MAIN_SHELL_VIEWPORT_LOCK_CLASS } from "@/lib/layout/main-shell-viewport";

const GlobalIncomingFriendRequestHost = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/GlobalIncomingFriendRequestHost").then(
        (mod) => mod.GlobalIncomingFriendRequestHost
      )
    ),
  { ssr: false }
);

/** Provider 트리·순서 불변 — Philife 글쓰기 시트 UI만 별도 청크로 분리 (giant graph 완화). */
const PhilifeWriteBottomSheetLazy = dynamic(
  () =>
    import("@/components/philife/PhilifeWriteBottomSheet").then((mod) => mod.PhilifeWriteBottomSheet),
  { ssr: false }
);

/** Provider 트리·순서 불변 — 거래 글쓰기 시트 UI만 별도 청크로 분리 (giant graph 완화). */
const TradeWriteBottomSheetLazy = dynamic(
  () =>
    import("@/components/trade/TradeWriteBottomSheet").then((mod) => mod.TradeWriteBottomSheet),
  { ssr: false }
);
const TradeChatEntryCreatingOverlayLazy = dynamic(
  () =>
    import("@/components/chats/TradeChatEntryCreatingOverlay").then(
      (mod) => mod.TradeChatEntryCreatingOverlay
    ),
  { ssr: false }
);

const INFO_HUB_PANEL_PUSH_WIDTH = "min(88vw, 30rem)";
const INFO_HUB_PANEL_PUSH_TRANSITION = "transform 580ms cubic-bezier(0.2, 0.65, 0.25, 1)";
const MAIN_SHELL_VIEWPORT_LOCK_HTML_CLASS = "sam-main-shell-viewport-lock";

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

function MainShellPushLayer({ children }: { children: ReactNode }) {
  const { open } = useMypageInfoHubPanel();
  const pushStyle = open
    ? {
        transform: `translate3d(${INFO_HUB_PANEL_PUSH_WIDTH},0,0)`,
        transition: INFO_HUB_PANEL_PUSH_TRANSITION,
        willChange: "transform" as const,
      }
    : undefined;
  return (
    <div
      data-main-shell-root
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col"
      style={pushStyle}
    >
      {children}
    </div>
  );
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
  initialTradeTabCategories = null,
}: {
  children: ReactNode;
  initialMainBottomNavItems?: BottomNavItemConfig[] | null;
  initialTradeTabCategories?: CategoryWithSettings[] | null;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add(MAIN_SHELL_VIEWPORT_LOCK_HTML_CLASS);
    return () => root.classList.remove(MAIN_SHELL_VIEWPORT_LOCK_HTML_CLASS);
  }, []);

  return (
    <RegionProvider>
      <MypageInfoHubPanelProvider>
        <LatestMenuNavigationProvider>
         <MainBottomNavTabsProvider initialTabs={initialMainBottomNavItems ?? null}>
          <TradeTabCategoriesServerPrime initialCategories={initialTradeTabCategories ?? null} />
          <AppWideRuntimePerfHooks />
          <SessionLostRedirect />
          <AuthComplianceRedirect />
          <OwnerHubBadgeRuntime />
          <MandatoryAddressGate />
          <PhoneVerificationRequiredDialog />
          <DiBaYNotificationOnboardingGate />
          <DevicePermissionUiHost />
          <FavoriteProvider>
            <NotificationSurfaceProvider>
              <IncomingCallOverlayChunkBoundary>
                <GlobalIncomingFriendRequestHost enabled />
              </IncomingCallOverlayChunkBoundary>
              <WriteCategoryProvider>
                <CategoryListHeaderProvider>
                  <StoreCommerceCartRuntimeBoundary>
                    <PhilifeWriteSheetProvider>
                      <TradeWriteSheetProvider>
                        <PhilifeHeaderMessengerStackProvider>
                          <TradeHeaderTradeHistoryStackProvider>
                            <MainTier1ChromeProvider>
                              <TradePresenceActivityProvider>
                                <MainShellPushLayer>
                                  <div className={MAIN_SHELL_VIEWPORT_LOCK_CLASS}>
                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                                    <MainAppHeaderStackWrap>
                                      <ConditionalAppShell
                                        regionBarInLayout={true}
                                        initialMainBottomNavItems={initialMainBottomNavItems}
                                      >
                                        {children}
                                      </ConditionalAppShell>
                                    </MainAppHeaderStackWrap>
                                    </div>
                                  </div>
                                </MainShellPushLayer>
                                <TradeChatEntryCreatingOverlayLazy />
                                <PhilifeWriteBottomSheetLazy />
                                <TradeWriteBottomSheetLazy />
                              </TradePresenceActivityProvider>
                            </MainTier1ChromeProvider>
                          </TradeHeaderTradeHistoryStackProvider>
                        </PhilifeHeaderMessengerStackProvider>
                      </TradeWriteSheetProvider>
                    </PhilifeWriteSheetProvider>
                  </StoreCommerceCartRuntimeBoundary>
                </CategoryListHeaderProvider>
              </WriteCategoryProvider>
            </NotificationSurfaceProvider>
          </FavoriteProvider>
         </MainBottomNavTabsProvider>
        </LatestMenuNavigationProvider>
      </MypageInfoHubPanelProvider>
    </RegionProvider>
  );
}
