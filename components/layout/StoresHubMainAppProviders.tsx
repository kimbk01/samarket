"use client";

import type { ReactNode } from "react";
import { MainAppProviderTree } from "@/components/layout/MainAppProviderTree";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

/**
 * `/stores` 허브 — `(stores)` route group layout 전용.
 * trade 칩 RSC 프라임·trade presence·글쓰기/채팅 오버레이 청크를 생략해 초기 hydrate 를 줄인다.
 */
export function StoresHubMainAppProviders({
  children,
  initialMainBottomNavItems = null,
}: {
  children: ReactNode;
  initialMainBottomNavItems?: BottomNavItemConfig[] | null;
}) {
  return (
    <MainAppProviderTree
      layoutProfile="storesHub"
      initialMainBottomNavItems={initialMainBottomNavItems}
      initialTradeTabCategories={null}
    >
      {children}
    </MainAppProviderTree>
  );
}
