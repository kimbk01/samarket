import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { MessengerContactsHeartbeat } from "@/components/community-messenger/contacts/MessengerContactsHeartbeat";

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
      {/* 연락처 앱 시작 처리 (SSOT v5 S7·#19) — 동의한 회원만 8초 뒤 유휴 시간에 엔진 지연 로드 */}
      <MessengerContactsHeartbeat />
      {children}
    </MainAppProviders>
  );
}
