"use client";

import { acquireCmRoomEntryTimingSession } from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";

/**
 * R2-M10 — overlay 는 `router.push` 이후 비동기로 올린다.
 * push 전 `flushSync`·rAF 는 route page mount 를 ~1프레임+ 지연시켰다.
 */
export function beginCmPreRouteRoomOpeningOverlay(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  acquireCmRoomEntryTimingSession(id, "nav_tap");
  useCmRoomOpeningOverlayStore.getState().beginOpening(id);
}

/** `router.push` 직후 follow-up(overlay·priority) — push 자체는 호출부에서 동기 실행 */
export function scheduleCmPreRouteRoomNavigationFollowUp(run: () => void): void {
  if (typeof window === "undefined") {
    run();
    return;
  }
  queueMicrotask(() => {
    useCmRoomOpeningOverlayStore.getState().noteRouteTransitionStarted();
    run();
  });
}
