"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CommunityMessengerRoomShellChromeFrame } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import {
  emitCmPreRouteShellOverlayVisibleLog,
  tryEmitCmPreRouteShellFinalLog,
} from "@/lib/community-messenger/room/cm-pre-route-shell-instrumentation";
import { measureCmPassRenderCommit } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";

const OVERLAY_Z = "z-[125]";

export const CommunityMessengerRoomOpeningOverlayHost = memo(function CommunityMessengerRoomOpeningOverlayHost() {
  const pathname = usePathname();
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
      reset();
    }
  }, [openingRoomId, pathname, phase, reset]);

  useEffect(() => {
    if (phase !== "handoff") return;
    const t = window.setTimeout(() => {
      tryEmitCmPreRouteShellFinalLog();
      reset();
    }, 180);
    return () => window.clearTimeout(t);
  }, [phase, reset]);

  if (!active || !openingRoomId) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 ${OVERLAY_Z} flex flex-col bg-[color:var(--cm-room-page-bg)] transition-opacity duration-150 ease-out ${
        phase === "handoff" ? "opacity-0" : "opacity-100"
      }`}
      data-cm-pre-route-shell
      data-cm-room-opening-overlay
      data-opening-room-id={openingRoomId}
      aria-hidden
    >
      <CommunityMessengerRoomShellChromeFrame
        narrowViewport
        dataAttrs={{
          "data-messenger-shell": "",
          "data-cm-room": "",
          "data-cm-room-pass0": "pre-route",
        }}
        className="min-h-0 flex-1"
      />
    </div>
  );
});
