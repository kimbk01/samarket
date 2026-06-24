"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import {
  callV4HandleRemoteTerminal,
  callV4HandleRejectRoute,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  registerCallV4ConnectedTerminalHandler,
  startCallV4TerminalRealtimeWatch,
} from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { primeCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { tryPrimeCallV4WebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-platform-owner-claim";
import {
  discoverCallV4IncomingSessionIfWebOwner,
  startCallV4IncomingDiscovery,
  tryHydrateCallV4IncomingForWebOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  getCallV4PersistedSurfaceOwner,
  ingestCallV4NativeIncomingSurfaceSignal,
  ingestCallV4SurfaceOwnerSignal,
  isCallV4NativeAcceptingSurface,
  registerCallV4NativeAcceptingSurface,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  syncCallV4NativeAcceptingSurfaceFromWindowLocation,
  type CallV4NativeIncomingSurfaceSignal,
  type CallV4SurfaceOwnerSignal,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  isCallV4CalleeAcceptRoute,
  isCallV4CalleeRejectRoute,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import {
  isNativeAcceptInflight,
  seedCallV4NativeAcceptInflightFromRoute,
  syncCallV4NativeAcceptInflightFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import {
  installDibayFcmCallBridge,
  type DibayFcmIncomingWakeDetail,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { CallV4IncomingSheet } from "@/components/community-messenger/call-v4/CallV4IncomingSheet";

type CallV4ProviderProps = {
  children?: ReactNode;
};

function registerCallV4NativeAcceptingFromAppPath(path: string): void {
  if (!shouldRegisterCallV4NativeAcceptingFromRoute(path)) return;
  const callId = readCallV4SessionIdFromNativeRoute(path);
  if (!callId) return;
  const source = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "").get(
    "source",
  )?.trim() ?? "native";
  registerCallV4NativeAcceptingSurface(
    callId,
    resolveCallV4NativeAcceptingSurfaceType(source),
    source,
  );
}

function seedCallV4NativeAcceptRouteState(path: string): void {
  const callId = seedCallV4NativeAcceptInflightFromRoute(path);
  if (!callId) return;
  const phase = readCallV4Phase();
  if (phase === "idle" || phase === "incoming_ringing") {
    useCallV4Store.getState().setPhase("accepting");
  }
}

async function hydrateCallV4IncomingWake(detail: DibayFcmIncomingWakeDetail): Promise<void> {
  const callId = detail.sessionId?.trim() ?? "";
  if (!callId) return;

  logCallV4("native_notification_received", {
    callId,
    roomId: detail.roomId ?? null,
    callKind: detail.callKind ?? null,
  });

  const session = await callV4FetchSession(callId);
  if (session?.status !== "ringing" || session.isMineInitiator) return;

  primeCallV4ConnectionWarm(callId);

  if (isNativeAcceptInflight(callId)) return;

  syncCallV4NativeAcceptingSurfaceFromWindowLocation();
  if (isCallV4NativeAcceptingSurface(callId)) {
    logCallV4("incoming_sheet_suppressed_native_accepting", { callId });
    return;
  }

  await tryPrimeCallV4WebIncomingOwner(callId, "fcm_wake");
  discoverCallV4IncomingSessionIfWebOwner(session);
}

/** V4 lane — foreground discovery + incoming sheet only (no V3 replay). */
export function CallV4Provider({ children }: CallV4ProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled() || !userId) return;
    return startCallV4IncomingDiscovery(userId);
  }, [userId]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    return registerCallV4ConnectedTerminalHandler((callId, status, source) =>
      callV4HandleRemoteTerminal(callId, status, readCallV4ExitRouter() ?? router, source),
    );
  }, [router]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled() || !userId) return;
    return startCallV4TerminalRealtimeWatch(userId);
  }, [userId]);

  useLayoutEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;
    syncCallV4NativeAcceptInflightFromWindowLocation();
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    const path = `${pathname ?? ""}${typeof window !== "undefined" ? window.location.search : ""}`;
    if (!path.includes("/community-messenger/calls-v4/")) return;
    if (isCallV4CalleeRejectRoute(path)) {
      const callId = readCallV4SessionIdFromNativeRoute(path);
      if (callId) void callV4HandleRejectRoute(callId, router);
      return;
    }
    if (isCallV4CalleeAcceptRoute(path)) {
      const acceptCallId = readCallV4SessionIdFromNativeRoute(path);
      logCallV4("route_accept_seen", { callId: acceptCallId, path });
      seedCallV4NativeAcceptRouteState(path);
      if (shouldRegisterCallV4NativeAcceptingFromRoute(path)) {
        registerCallV4NativeAcceptingFromAppPath(path);
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;

    const onNativeRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      if (isCallV4CalleeAcceptRoute(path)) {
        logCallV4("route_accept_seen", {
          callId: readCallV4SessionIdFromNativeRoute(path),
          path,
          source: "native_route_event",
        });
        seedCallV4NativeAcceptRouteState(path);
      }
      registerCallV4NativeAcceptingFromAppPath(path);
    };

    window.addEventListener("dibay:call-route", onNativeRoute);
    window.addEventListener("dibay:push-route", onNativeRoute);
    return () => {
      window.removeEventListener("dibay:call-route", onNativeRoute);
      window.removeEventListener("dibay:push-route", onNativeRoute);
    };
  }, []);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;

    const onNativeSurfaceBridge = (event: Event) => {
      const detail = (event as CustomEvent<CallV4NativeIncomingSurfaceSignal>).detail;
      if (!detail?.callId) return;
      logCallV4("native_surface_bridge_received", {
        callId: detail.callId.trim(),
        visible: detail.hasNativeIncomingSurface,
        source: detail.source,
      });
      ingestCallV4NativeIncomingSurfaceSignal(detail);
    };

    const onSurfaceOwnerBridge = (event: Event) => {
      const detail = (event as CustomEvent<CallV4SurfaceOwnerSignal>).detail;
      if (!detail?.callId) return;
      logCallV4("surface_owner_bridge_received", {
        callId: detail.callId.trim(),
        owner: detail.owner,
        reason: detail.reason,
      });
      ingestCallV4SurfaceOwnerSignal(detail);
      const owner = getCallV4PersistedSurfaceOwner(detail.callId.trim());
      if (owner === "web_in_app") {
        void tryHydrateCallV4IncomingForWebOwner(detail.callId.trim());
      }
    };

    window.addEventListener("dibay:call-v4-native-surface", onNativeSurfaceBridge);
    window.addEventListener("dibay:call-surface-owner", onSurfaceOwnerBridge);
    return () => {
      window.removeEventListener("dibay:call-v4-native-surface", onNativeSurfaceBridge);
      window.removeEventListener("dibay:call-surface-owner", onSurfaceOwnerBridge);
    };
  }, []);

  useEffect(() => {
    if (!isCallV4TelegramLaneEnabled()) return;

    logCallV4("provider_ready", {});

    const offBridge = installDibayFcmCallBridge({
      onIncomingWake: (detail) => {
        /* @legacy Phase1-5 — Web must not self-register native surface on fcm_wake (Phase 6A). */
        void hydrateCallV4IncomingWake(detail);
      },
      onFcmTerminal: (detail) => {
        void callV4HandleRemoteTerminal(
          detail.callId,
          detail.terminalKind,
          readCallV4ExitRouter() ?? router,
          "fcm"
        );
      },
    });

    const offBus = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const callId = ev.sessionId?.trim();
      if (!callId) return;
      void callV4HandleRemoteTerminal(callId, ev.status ?? "cancelled", readCallV4ExitRouter() ?? router, "bus");
    });

    return () => {
      offBridge();
      offBus();
    };
  }, [router]);

  if (!isCallV4TelegramLaneEnabled()) return children ?? null;

  return (
    <>
      <CallV4IncomingSheet />
      {children}
    </>
  );
}

function CallV4IncomingChrome() {
  return (
    <CallV4Provider>
      <></>
    </CallV4Provider>
  );
}

export { CallV4IncomingChrome };
