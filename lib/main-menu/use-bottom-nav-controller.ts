"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getBottomNavControllerServerState,
  getBottomNavControllerState,
  settleBottomNavForLocation,
  subscribeBottomNavController,
  type BottomNavControllerState,
  type BottomNavShowingTarget,
} from "@/lib/main-menu/bottom-nav-controller";

export function useBottomNavControllerState(): BottomNavControllerState {
  return useSyncExternalStore(
    subscribeBottomNavController,
    getBottomNavControllerState,
    getBottomNavControllerServerState
  );
}

/** 하단 탭 이동 중(손 뗀 뒤 ~ Next 경로 확정 전) 목표 — 아니면 null */
export function useBottomNavShowingTarget(): BottomNavShowingTarget | null {
  const s = useBottomNavControllerState();
  return s.phase === "showing" ? s : null;
}

/** 실제 Next 경로가 바뀌면 컨트롤러를 끝낸다 — 셸(`ConditionalAppShell`)에 1개 */
export function useSettleBottomNavOnLocation(routePathname: string | null): void {
  useEffect(() => {
    settleBottomNavForLocation(routePathname);
  }, [routePathname]);
}
