"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { MiniLocalVideo } from "@/components/messenger/call/MiniLocalVideo";
import {
  getCommunityMessengerCallRuntime,
  getCommunityMessengerCallRuntimeSurface,
  subscribeCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";
import { cleanupCommunityCallTerminal, isTerminalStatusForCleanup } from "@/lib/community-messenger/call-terminal-cleanup";

/**
 * PiP minimized 상태 — 앱 전역 fixed portal.
 */
export function GlobalCallVideoPipHost() {
  const [portalReady, setPortalReady] = useState(false);
  const [, surfaceTick] = useState(0);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    return subscribeCommunityMessengerCallRuntimeSurface(() => {
      surfaceTick((v) => v + 1);
    });
  }, []);

  const surface = getCommunityMessengerCallRuntimeSurface();
  const runtime = getCommunityMessengerCallRuntime();
  const runtimeSessionId = runtime?.sessionId?.trim() ?? "";
  const runtimeStatus = runtime?.session?.status ?? null;
  const bindings = surface.videoPipLayout;

  useEffect(() => {
    if (surface.presentation !== "pip-minimized") return;
    if (!runtimeSessionId || !isTerminalStatusForCleanup(runtimeStatus)) return;
    void cleanupCommunityCallTerminal({
      sessionId: runtimeSessionId,
      reason: runtimeStatus ?? "terminal",
      source: "global_call_pip_host",
    });
  }, [runtimeSessionId, runtimeStatus, surface.presentation]);

  if (!portalReady || typeof document === "undefined") return null;
  if (surface.presentation !== "pip-minimized" || !bindings) return null;

  return createPortal(
    <MiniLocalVideo
      ref={bindings.pipRef}
      label={bindings.pipLabel}
      widthPx={bindings.widthPx}
      heightPx={bindings.heightPx}
      style={bindings.pipStyle ?? undefined}
      useAnchoredPosition={Boolean(bindings.pipStyle)}
      positionMode="viewport-fixed"
      micMuted={bindings.micMuted}
      cameraOff={bindings.cameraOff}
      onExpand={bindings.onPipExpand ?? surface.expandToFullscreen ?? undefined}
      onPointerDown={bindings.onPipPointerDown}
      onPointerMove={bindings.onPipPointerMove}
      onPointerUp={bindings.onPipPointerUp}
      onPointerCancel={bindings.onPipPointerCancel}
    >
      {surface.miniVideoSlot}
    </MiniLocalVideo>,
    document.body
  );
}
