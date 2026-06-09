"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { MiniLocalVideo } from "@/components/messenger/call/MiniLocalVideo";
import {
  getCommunityMessengerCallRuntimeSurface,
  subscribeCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";

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
  const bindings = surface.videoPipLayout;

  if (!portalReady || typeof document === "undefined") return null;
  if (surface.presentation !== "minimized" || !bindings) return null;

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
