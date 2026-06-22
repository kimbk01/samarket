"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CallDock } from "@/components/community-messenger/call-ui/CallDock";
import {
  getCallDockPresentationState,
  shouldShowCallDockLayer,
  subscribeCallDockPresentation,
} from "@/lib/community-messenger/call-dock-presentation";
import {
  getCommunityMessengerCallRuntimeSurface,
  subscribeCommunityMessengerCallRuntimeSurface,
  type CallDockSnapshot,
} from "@/lib/community-messenger/call-runtime-registry";
import {
  CALL_DOCK_LAYER_STYLE,
  callDockLayerTransitionStyle,
} from "@/lib/community-messenger/call-ui/call-dock-theme";

const IDLE_PRESENTATION = {
  visualPhase: "hidden" as const,
  restoreInFlight: false,
  pendingSessionId: null,
};

/**
 * DIBAY Call Dock — body portal · position:fixed · route·scroll·keyboard·bottom nav 독립.
 */
export function GlobalCallDockHost() {
  const [portalReady, setPortalReady] = useState(false);
  const pres = useSyncExternalStore(
    subscribeCallDockPresentation,
    getCallDockPresentationState,
    () => IDLE_PRESENTATION
  );
  useSyncExternalStore(
    subscribeCommunityMessengerCallRuntimeSurface,
    getCommunityMessengerCallRuntimeSurface,
    () => getCommunityMessengerCallRuntimeSurface()
  );

  const snapshotRef = useRef<CallDockSnapshot | null>(null);
  const surface = getCommunityMessengerCallRuntimeSurface();
  if (surface.dockSnapshot) {
    snapshotRef.current = surface.dockSnapshot;
  }
  const snapshot = snapshotRef.current;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (!portalReady || typeof document === "undefined") return null;
  if (!shouldShowCallDockLayer() || !snapshot) return null;
  if (!surface.onDockExpand || !surface.onDockEnd || !surface.onDockToggleMute) return null;

  const layerVisible = pres.visualPhase === "visible" || pres.visualPhase === "entering";

  return createPortal(
    <div
      style={{
        ...CALL_DOCK_LAYER_STYLE,
        ...callDockLayerTransitionStyle(layerVisible),
      }}
    >
      <CallDock
        snapshot={snapshot}
        onExpand={surface.onDockExpand}
        onEnd={surface.onDockEnd}
        onToggleMute={surface.onDockToggleMute}
      />
    </div>,
    document.body
  );
}
