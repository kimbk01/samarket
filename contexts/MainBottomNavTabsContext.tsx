"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  areBottomNavItemConfigsEqual,
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  fetchMainBottomNavDeduped,
  MAIN_BOTTOM_NAV_LS_REV_KEY,
  primeMainBottomNavDedupedCache,
} from "@/lib/app/fetch-main-bottom-nav-deduped";
import { KASAMA_MAIN_BOTTOM_NAV_UPDATED } from "@/lib/chats/chat-channel-events";

/**
 * 메인 하단 5탭(+ `custom_*`) 의 **현재 순서**를 단일 소스로 노출하는 client Provider.
 *
 * 책임 분리:
 * - 화면 렌더(`BottomNav`)와 라우트 슬라이드 방향 결정(`useRouteTransitionKindRef`) 모두
 *   동일한 `tabs` 를 본다 → admin 에서 순서를 바꾸면 둘 다 동시에 갱신.
 * - SSR hydrate 정합: server `loadMainBottomNavItemsServerCached` → `(main)/layout.tsx` →
 *   `MainAppProviderTree` → 본 Provider 의 `initialTabs` 로 전달.
 *
 * fetch/이벤트 정책(과거 `BottomNav` 내부 effect 와 동일):
 * - 최초 마운트 1회 + 관리자(/admin/*) 이탈 시 강제 재조회.
 * - `KASAMA_MAIN_BOTTOM_NAV_UPDATED` 커스텀 이벤트(같은 탭 내 admin 저장 직후) 시 force GET.
 * - `MAIN_BOTTOM_NAV_LS_REV_KEY` storage 이벤트(다른 탭 동기화) 시 force GET.
 */

interface MainBottomNavTabsContextValue {
  tabs: BottomNavItemConfig[];
  /** Provider mount 직후 첫 hydrate 가 끝났는지 — 디버깅·테스트용 */
  hydrated: boolean;
}

const MainBottomNavTabsContext = createContext<MainBottomNavTabsContextValue | null>(null);

function cloneTabs(items: readonly BottomNavItemConfig[]): BottomNavItemConfig[] {
  return items.map((item) => ({ ...item }));
}

export function MainBottomNavTabsProvider({
  initialTabs,
  children,
}: {
  initialTabs?: readonly BottomNavItemConfig[] | null;
  children: ReactNode;
}) {
  const seedTabs = useMemo(
    () =>
      initialTabs && initialTabs.length > 0
        ? cloneTabs(initialTabs)
        : cloneTabs(BOTTOM_NAV_ITEMS),
    [initialTabs]
  );
  const [tabs, setTabs] = useState<BottomNavItemConfig[]>(seedTabs);
  const [hydrated, setHydrated] = useState<boolean>(
    Boolean(initialTabs && initialTabs.length > 0)
  );
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  /** SSR fetch 결과를 deduped 캐시에 넣어 초기 client GET 의 round-trip 을 줄인다. */
  useEffect(() => {
    if (initialTabs && initialTabs.length > 0) {
      primeMainBottomNavDedupedCache(cloneTabs(initialTabs));
    }
  }, [initialTabs]);

  /** Provider tabs 가 바깥에서 새로 prop 으로 들어온 경우(router cache miss 후 재 hydrate) 동기화 */
  useEffect(() => {
    setTabs((prev) => (areBottomNavItemConfigsEqual(prev, seedTabs) ? prev : seedTabs));
  }, [seedTabs]);

  const applyTabs = useCallback(async (force: boolean) => {
    try {
      const { ok, items } = await fetchMainBottomNavDeduped({ force });
      if (!ok || !items?.length) return;
      setTabs((prev) => (areBottomNavItemConfigsEqual(prev, items) ? prev : items));
      setHydrated(true);
    } catch {
      /* 네트워크 실패 시 seedTabs 유지 */
    }
  }, []);

  /** 최초 마운트 1회 + 관리자 이탈 시 강제 재조회. */
  useEffect(() => {
    const cur = pathname ?? "";
    const prev = prevPathRef.current;
    prevPathRef.current = cur;
    const leftAdminSurface =
      Boolean(prev && cur) && (prev?.startsWith("/admin") ?? false) && !cur.startsWith("/admin");
    if (leftAdminSurface) {
      void applyTabs(true);
      return;
    }
    if (prev !== null) return;
    if (initialTabs && initialTabs.length > 0) return;
    void applyTabs(false);
  }, [pathname, applyTabs, initialTabs]);

  /** admin 저장 직후·다른 탭 동기화 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onRemoteUpdate = () => void applyTabs(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MAIN_BOTTOM_NAV_LS_REV_KEY || e.newValue == null) return;
      void applyTabs(true);
    };
    window.addEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(KASAMA_MAIN_BOTTOM_NAV_UPDATED, onRemoteUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [applyTabs]);

  const value = useMemo<MainBottomNavTabsContextValue>(
    () => ({ tabs, hydrated }),
    [tabs, hydrated]
  );

  return (
    <MainBottomNavTabsContext.Provider value={value}>
      {children}
    </MainBottomNavTabsContext.Provider>
  );
}

/**
 * 메인 하단 탭의 **현재 순서**를 그대로 받는다(Provider 외부에서는 코드 기본값).
 * 기본값을 두는 이유: `/admin/*`, `/auth/*` 등 ProviderTree 가 mount 되지 않는 라우트에서도
 * 안전하게 호출할 수 있도록 (`useRouteTransitionKindRef` 는 모든 경로에서 동작).
 */
export function useMainBottomNavTabs(): BottomNavItemConfig[] {
  const ctx = useContext(MainBottomNavTabsContext);
  return ctx ? ctx.tabs : (BOTTOM_NAV_ITEMS as readonly BottomNavItemConfig[]).slice();
}

export function useMainBottomNavTabsHydrated(): boolean {
  const ctx = useContext(MainBottomNavTabsContext);
  return ctx ? ctx.hydrated : false;
}
