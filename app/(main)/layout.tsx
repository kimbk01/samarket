import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { getHomeTradeChipCategoriesForServer } from "@/lib/categories/get-home-trade-chip-categories-server";
import { loadMainBottomNavItemsServerCached } from "@/lib/main-menu/load-main-bottom-nav-items-server";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ items: initialMainBottomNavItems }, initialTradeTabCategories] = await Promise.all([
    loadMainBottomNavItemsServerCached(),
    getHomeTradeChipCategoriesForServer(),
  ]);
  return (
    <MainAppProviders
      initialMainBottomNavItems={initialMainBottomNavItems}
      initialTradeTabCategories={initialTradeTabCategories}
    >
      <MessengerRoomRouteEntryMountProbe stage="layout" />
      {children}
    </MainAppProviders>
  );
}
