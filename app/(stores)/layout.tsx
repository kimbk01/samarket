import { StoresHubMainAppProviders } from "@/components/layout/StoresHubMainAppProviders";
import { measureStoresHubLayoutServerLoads } from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";

/**
 * Phase 9 — `/stores` 허브만 `(main)` 레이아웃 체인에서 분리.
 * `(main)/layout` 의 trade 카테고리 DB await 없이 bottom nav 프라임만 수행한다.
 */
export default async function StoresRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { initialMainBottomNavItems } = await measureStoresHubLayoutServerLoads();
  return (
    <StoresHubMainAppProviders initialMainBottomNavItems={initialMainBottomNavItems}>
      {children}
    </StoresHubMainAppProviders>
  );
}
