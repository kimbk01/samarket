"use client";

import { flushSync } from "react-dom";
import { startTransition } from "react";
import { acquireCmRoomEntryTimingSession } from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";

/** 탭 직후 sync flush 로 global overlay 를 먼저 commit 한다. */
export function beginCmPreRouteRoomOpeningOverlay(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof window === "undefined") return;
  acquireCmRoomEntryTimingSession(id, "nav_tap");
  flushSync(() => {
    useCmRoomOpeningOverlayStore.getState().beginOpening(id);
  });
}

export function scheduleCmPreRouteRoomNavigation(run: () => void): void {
  if (typeof window === "undefined") {
    run();
    return;
  }
  window.requestAnimationFrame(() => {
    useCmRoomOpeningOverlayStore.getState().noteRouteTransitionStarted();
    startTransition(() => {
      run();
    });
  });
}
