"use client";

import { useContext, useMemo, type ReactNode } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  NavigationPromisesContext,
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { BottomNavShowingTarget } from "@/lib/main-menu/bottom-nav-controller";

/**
 * 하단 탭 즉시 교체 중(손 뗀 프레임 ~ Next 경로 확정) 셸 머리글이 **목표 허브 주소**로 그려지게 주소 값만 바꿔 공급한다
 * (계약 v2 · Owner 2026-11-15). 본문 쪽 같은 방식 = `HubRetentionStack` 의 `FrozenRouterContexts`.
 * target 이 없으면 지금 값을 그대로 다시 공급한다 — 공급 요소 구조를 항상 같게 둬 머리글이 탭마다 다시 마운트되지 않게.
 * Next 16.1.7 개발 모드의 `usePathname`·`useSearchParams` 는 `NavigationPromisesContext` 를 먼저 읽는다(Suspense 계측, 운영 빌드는 읽지 않음) —
 * target 이 있을 때만 null 로 공급해 개발에서도 운영과 같은 값(PathnameContext)을 읽게 한다.
 */
export function BottomNavShowingRouteContexts({
  target,
  children,
}: {
  target: Pick<BottomNavShowingTarget, "path" | "search"> | null;
  children: ReactNode;
}) {
  const livePathname = useContext(PathnameContext);
  const liveSearchParams = useContext(SearchParamsContext);
  const liveNavigationPromises = useContext(NavigationPromisesContext);
  const search = target?.search ?? null;
  const targetParams = useMemo(
    () => (search == null ? null : (new URLSearchParams(search) as unknown as ReadonlyURLSearchParams)),
    [search]
  );
  return (
    <NavigationPromisesContext.Provider value={target ? null : liveNavigationPromises}>
      <PathnameContext.Provider value={target ? target.path : livePathname}>
        <SearchParamsContext.Provider value={targetParams ?? liveSearchParams}>{children}</SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </NavigationPromisesContext.Provider>
  );
}
