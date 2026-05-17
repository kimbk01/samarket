import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { MessengerRoomR2M11CLayoutTimingBridge } from "@/components/community-messenger/room/MessengerRoomR2M11CLayoutTimingBridge";
import { measureMainLayoutServerLoads } from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 *
 * R2-M11C — 계측만: layout 진입·headers/cookies·auth·bottom nav·menu·children 직전.
 * headers/cookies·auth/profile 은 본 layout 에서 호출하지 않음 → 0ms·invoked=false.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /** 1. layout 함수 진입 — `measureMainLayoutServerLoads` 내부 t0 */
  const { initialMainBottomNavItems, initialTradeTabCategories, timing: layoutTiming } =
    await measureMainLayoutServerLoads();
  /** 6. children render 직전 — `layoutTiming.children_render_before_ms` */
  return (
    <MainAppProviders
      initialMainBottomNavItems={initialMainBottomNavItems}
      initialTradeTabCategories={initialTradeTabCategories}
    >
      <MessengerRoomR2M11CLayoutTimingBridge layoutTiming={layoutTiming} />
      <MessengerRoomRouteEntryMountProbe stage="layout" />
      {children}
    </MainAppProviders>
  );
}
