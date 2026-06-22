"use client";

import { useEffect, useRef } from "react";
import { notifyCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import {
  enterAndroidOsPipCommunityCall,
  exitAndroidOsPipCommunityCall,
  expandCommunityCallFromAndroidOsPip,
  readDockedCallSessionId,
  readAndroidOsPipCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";
import {
  getCommunityMessengerCallRuntime,
  getCommunityMessengerCallRuntimeSurface,
  subscribeCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";
import {
  subscribeDibayCallPipAction,
  subscribeDibayCallPipModeChanged,
} from "@/lib/call/native/dibay-call-pip";

const PIP_FALLBACK_DOCK_EVENT = "dibay:call-pip-fallback-dock";

/**
 * Android OS PiP ↔ Web presentation bridge.
 * iOS: stub only (native PiP phase 분리).
 */
export function DibayCallPipBridgeHost() {
  const endRef = useRef<(() => void) | null>(null);
  const muteRef = useRef<(() => void) | null>(null);
  const dockRef = useRef<(() => void) | null>(null);

  const syncHandlers = () => {
    const surface = getCommunityMessengerCallRuntimeSurface();
    endRef.current = surface.onDockEnd;
    muteRef.current = surface.onDockToggleMute;
    dockRef.current = surface.onDockExpand;
  };

  useEffect(() => {
    syncHandlers();
    return subscribeCommunityMessengerCallRuntimeSurface(syncHandlers);
  }, []);

  useEffect(() => {
    let unsubMode = () => {};
    let unsubAction = () => {};
    void subscribeDibayCallPipModeChanged((event) => {
      const callId = event.callId?.trim();
      if (!callId) return;
      const runtime = getCommunityMessengerCallRuntime();
      if (!runtime || runtime.sessionId !== callId) return;
      if (event.inPipMode) {
        enterAndroidOsPipCommunityCall({
          sessionId: callId,
          roomId: runtime.session?.roomId ?? null,
          cleanup: () => runtime.cleanupMedia(),
        });
        notifyCommunityCallHostSync();
      } else {
        exitAndroidOsPipCommunityCall(callId);
        expandCommunityCallFromAndroidOsPip(callId);
        notifyCommunityCallHostSync();
      }
    }).then((unsub) => {
      unsubMode = unsub;
    });
    void subscribeDibayCallPipAction((event) => {
      if (event.action === "end") {
        endRef.current?.();
        return;
      }
      if (event.action === "mute") {
        muteRef.current?.();
        return;
      }
      if (event.action === "restore") {
        const callId = event.callId?.trim();
        if (callId) {
          expandCommunityCallFromAndroidOsPip(callId);
          notifyCommunityCallHostSync();
        }
        dockRef.current?.();
      }
    }).then((unsub) => {
      unsubAction = unsub;
    });

    const onFallbackDock = () => {
      if (readAndroidOsPipCallSessionId()) return;
      const runtime = getCommunityMessengerCallRuntime();
      if (!runtime?.sessionId || readDockedCallSessionId() === runtime.sessionId) return;
      const surface = getCommunityMessengerCallRuntimeSurface();
      surface.minimizeToDock?.() ?? dockRef.current?.();
    };
    window.addEventListener(PIP_FALLBACK_DOCK_EVENT, onFallbackDock);
    return () => {
      unsubMode();
      unsubAction();
      window.removeEventListener(PIP_FALLBACK_DOCK_EVENT, onFallbackDock);
    };
  }, []);

  return null;
}
