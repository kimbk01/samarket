import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 *
 * Boot P0 — bottom nav·trade chip 서버 await 제거: HTML TTFB 를 막지 않고
 * 클라 `BOTTOM_NAV_ITEMS` seed + `useTradeTabs` client fetch 로 보강한다.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MainAppProviders initialMainBottomNavItems={null} initialTradeTabCategories={null}>
      <MessengerRoomRouteEntryMountProbe stage="layout" />
      {children}
    </MainAppProviders>
  );
}
