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
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

const PIP_FALLBACK_DOCK_EVENT = "dibay:call-pip-fallback-dock";

/** Native OS PiP ↔ Web presentation bridge (Android dock + iOS native video PiP emit). */
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
      const platform = resolveCapacitorShellPlatform();
      if (platform === "android") {
        if (event.inPipMode) {
          enterAndroidOsPipCommunityCall({
            sessionId: callId,
            roomId: runtime.session?.roomId ?? null,
            cleanup: () => runtime.cleanupMedia(),
          });
        } else {
          exitAndroidOsPipCommunityCall(callId);
          expandCommunityCallFromAndroidOsPip(callId);
        }
      }
      notifyCommunityCallHostSync();
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
        if (resolveCapacitorShellPlatform() === "android" && callId) {
          expandCommunityCallFromAndroidOsPip(callId);
        }
        notifyCommunityCallHostSync();
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
