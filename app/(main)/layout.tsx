import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { MAIN_BOTTOM_NAV_SETTINGS_KEY } from "@/lib/main-menu/main-bottom-nav-key";
import { resolveMainBottomNavDisplayItems } from "@/lib/main-menu/resolve-main-bottom-nav";
import { resolveMainBottomNavDisplayItemsWithTradeOverlay } from "@/lib/main-menu/overlay-bottom-nav-labels-from-trade-categories";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

async function loadInitialMainBottomNavItems(): Promise<BottomNavItemConfig[]> {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return resolveMainBottomNavDisplayItems(null);
  }
  try {
    const { data, error } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
      .maybeSingle();
    if (error) {
      if (
        error.message?.includes("admin_settings") &&
        error.message.includes("does not exist")
      ) {
        return resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, null);
      }
      console.warn("[main layout] bottom-nav bootstrap fallback:", error.message);
      return resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, null);
    }
    return resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, data?.value_json ?? null);
  } catch {
    return resolveMainBottomNavDisplayItems(null);
  }
}

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialMainBottomNavItems = await loadInitialMainBottomNavItems();
  return (
    <MainAppProviders initialMainBottomNavItems={initialMainBottomNavItems}>
      <MessengerRoomRouteEntryMountProbe stage="layout" />
      {children}
    </MainAppProviders>
  );
}
