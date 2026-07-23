"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  clearRoomEntryIntent,
  isRoomEntryInFlight,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { getActiveDeepRouteNavigationLock } from "@/lib/navigation/cm-deep-route-navigation-lock";
import {
  emitCmPreRouteShellOverlayVisibleLog,
  tryEmitCmPreRouteShellFinalLog,
} from "@/lib/community-messenger/room/cm-pre-route-shell-instrumentation";
import { measureCmPassRenderCommit } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

/**
 * Pre-route overlay host — store/handoff only.
 * DO NOT paint ShellChromeFrame (fake room without back). That was the first step of 2단 진입.
 */
export const CommunityMessengerRoomOpeningOverlayHost = memo(function CommunityMessengerRoomOpeningOverlayHost() {
  const pathname = usePathname();
  const isMessengerSplit = useIsMessengerSplitViewport();
  const openingRoomId = useCmRoomOpeningOverlayStore((s) => s.openingRoomId);
  const phase = useCmRoomOpeningOverlayStore((s) => s.phase);
  const noteOverlayVisible = useCmRoomOpeningOverlayStore((s) => s.noteOverlayVisible);
  const reset = useCmRoomOpeningOverlayStore((s) => s.reset);
  const overlayPaintStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  overlayPaintStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;

  const active = Boolean(openingRoomId) && (phase === "overlay" || phase === "handoff");

  useLayoutEffect(() => {
    if (!active || !openingRoomId) return;
    noteOverlayVisible();
    emitCmPreRouteShellOverlayVisibleLog();
    measureCmPassRenderCommit(0, overlayPaintStartRef.current);
  }, [active, noteOverlayVisible, openingRoomId]);

  useEffect(() => {
    if (!openingRoomId) return;
    const onPath = pathname?.includes(`/community-messenger/rooms/${encodeURIComponent(openingRoomId)}`);
    if (!onPath && phase !== "handoff") {
      const lock = getActiveDeepRouteNavigationLock();
      const preRoutePending =
        phase === "overlay" &&
        (isRoomEntryInFlight(openingRoomId) || (lock?.kind === "room" && lock.targetId === openingRoomId));
      if (!preRoutePending) {
        reset();
      }
    }
  }, [openingRoomId, pathname, phase, reset]);

  useEffect(() => {
    if (!isMessengerSplit || !openingRoomId) return;
    reset();
  }, [isMessengerSplit, openingRoomId, reset]);

  useEffect(() => {
    if (phase !== "handoff" || !openingRoomId) return;
    const roomId = openingRoomId;
    const t = window.setTimeout(() => {
      tryEmitCmPreRouteShellFinalLog();
      clearRoomEntryIntent(roomId);
      reset();
    }, 180);
    return () => window.clearTimeout(t);
  }, [phase, openingRoomId, reset]);

  // No DOM — list stays until real room mounts.
  return null;
});
