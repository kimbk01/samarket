"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { CallBackgroundSplitPreview } from "@/components/community-messenger/call-ui/CallBackgroundSplitPreview";
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

  const splitPreview = Boolean(surface.dockSnapshot?.useSplitPreview);
  const remoteSlot = surface.dockSnapshot?.remoteVideoThumbSlot;
  const localSlot = surface.miniVideoSlot;

  return createPortal(
    splitPreview && remoteSlot && localSlot ? (
      <MiniLocalVideo
        ref={bindings.pipRef}
        label={bindings.pipLabel}
        widthPx={bindings.widthPx ? bindings.widthPx * 1.85 : undefined}
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
        <CallBackgroundSplitPreview remoteSlot={remoteSlot} localSlot={localSlot} />
      </MiniLocalVideo>
    ) : (
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
        {localSlot}
      </MiniLocalVideo>
    ),
    document.body
  );
}
