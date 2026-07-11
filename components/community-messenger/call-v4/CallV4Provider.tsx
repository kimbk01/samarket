"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { startNativeConnectedSync } from "@/lib/call/native/native-connected-sync";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { useCallV4ForegroundResume } from "@/lib/community-messenger/call-v4/use-call-v4-foreground-resume";
import { useCallV4PresentationPlatform } from "@/lib/community-messenger/call-v4/presentation/use-call-v4-presentation-platform";
import {
  callV4HandleRejectRoute,
  callV4HandleRemoteTerminal,
  hydrateCallV4CalleeScreen,
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
  normalizeCallV4AppPath,
  readCallV4SessionIdFromNativeRoute,
} from "@/lib/community-messenger/call-v4/call-v4-native-route";
import {
  isNativeAcceptInflight,
  seedCallV4NativeAcceptInflightFromRoute,
  syncCallV4NativeAcceptInflightFromWindowLocation,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { maybeFinalizeCallV4FromVoipSurfaceOwnerBridge } from "@/lib/community-messenger/call-v4/call-v4-voip-surface-terminal-bridge";
import {
  installDibayFcmCallBridge,
  type DibayFcmIncomingWakeDetail,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { CallV4IncomingSheet } from "@/components/community-messenger/call-v4/CallV4IncomingSheet";
import { CallV4ActiveCallHost } from "@/components/community-messenger/call-v4/CallV4ActiveCallHost";

type CallV4ProviderProps = {
  children?: ReactNode;
};

/** Mount sync companion when V4 lane ON or Android native lane (V4 env OFF still syncs). */
function shouldMountCallV4Companion(): boolean {
  return isCallV4TelegramLaneEnabled() || isLegacyWebCallEstablishmentRemoved();
}

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

function logCallV4RouteAcceptDetected(path: string, source?: string): void {
  const acceptCallId = readCallV4SessionIdFromNativeRoute(path);
  if (!acceptCallId) return;
  logCallV4("route_accept_seen", { callId: acceptCallId, path, source: source ?? null });
  void callV4FetchSession(acceptCallId).then((session) => {
    const kind =
      session?.callKind === "video" ? "video" : session?.callKind === "voice" ? "audio" : "unknown";
    logCallV4("call_v4_route_accept_detected", {
      callId: acceptCallId,
      kind,
      path,
      source: source ?? null,
    });
  });
}

function seedCallV4NativeAcceptRouteState(path: string): void {
  const callId = seedCallV4NativeAcceptInflightFromRoute(path);
  if (!callId) return;
  const phase = readCallV4Phase();
  if (phase === "idle" || phase === "incoming_ringing" || phase === "accepting") {
    useCallV4Store.getState().setPhase("accepting");
  }
  void hydrateCallV4CalleeScreen(callId);
}

const replacedV4AcceptCallIds = new Set<string>();

function isAlreadyOnCallV4AcceptRoute(currentPath: string, targetPath: string): boolean {
  const current = normalizeCallV4AppPath(currentPath);
  const target = normalizeCallV4AppPath(targetPath);
  if (!isCallV4CalleeAcceptRoute(current)) return false;
  const currentCallId = readCallV4SessionIdFromNativeRoute(current);
  const targetCallId = readCallV4SessionIdFromNativeRoute(target);
  return Boolean(currentCallId && targetCallId && currentCallId === targetCallId);
}

/** Native `dibay:call-route` accept — seed inflight then ensure calls-v4 screen navigation. */
export function handleCallV4NativeRouteEvent(
  path: string,
  router: { replace: (href: string) => void },
  currentPath: string,
): void {
  const normalizedPath = normalizeCallV4AppPath(path);
  if (!normalizedPath) return;

  logCallV4("call_v4_route_event_received", { path: normalizedPath });

  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", {
      callId: readCallV4SessionIdFromNativeRoute(normalizedPath),
      path: normalizedPath,
      trigger: "native_route_event",
    });
    return;
  }

  if (isCallV4CalleeAcceptRoute(normalizedPath)) {
    const source =
      new URLSearchParams(
        normalizedPath.includes("?") ? normalizedPath.slice(normalizedPath.indexOf("?") + 1) : "",
      ).get("source")?.trim() ?? null;
    logCallV4("web_call_v4_native_accept_received", {
      callId: readCallV4SessionIdFromNativeRoute(normalizedPath),
      path: normalizedPath,
      source,
    });
    logCallV4RouteAcceptDetected(normalizedPath, "native_route_event");
    seedCallV4NativeAcceptRouteState(normalizedPath);
    const callId = readCallV4SessionIdFromNativeRoute(normalizedPath);
    logCallV4("call_v4_route_accept_seeded", {
      callId: callId ?? null,
      path: normalizedPath,
    });

    if (callId) {
      if (isAlreadyOnCallV4AcceptRoute(currentPath, normalizedPath)) {
        logCallV4("router_replace_calls_v4_accept_skipped_duplicate", {
          callId,
          path: normalizedPath,
          reason: "already_on_route",
        });
      } else if (replacedV4AcceptCallIds.has(callId)) {
        logCallV4("router_replace_calls_v4_accept_skipped_duplicate", {
          callId,
          path: normalizedPath,
          reason: "already_replaced",
        });
      } else {
        replacedV4AcceptCallIds.add(callId);
        logCallV4("router_replace_calls_v4_accept", { callId, path: normalizedPath });
        router.replace(normalizedPath);
      }
    }
  }

  registerCallV4NativeAcceptingFromAppPath(normalizedPath);
}

export function resetCallV4AcceptRouteReplaceForTests(): void {
  replacedV4AcceptCallIds.clear();
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

type CallV4WebEstablishmentHostProps = {
  children?: ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  userId: string | null;
};

/** Desktop / non-Android Web establishment shell — not mounted on Android sync-only. */
function CallV4WebEstablishmentHost({ children, pathname, router, userId }: CallV4WebEstablishmentHostProps) {
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity);

  useCallV4PresentationPlatform({
    callId: identity?.callId ?? null,
    phase,
    mediaType: identity?.mediaType ?? null,
    roomId: identity?.roomId ?? null,
  });

  useCallV4ForegroundResume();

  useEffect(() => {
    if (!userId) return;
    return startCallV4IncomingDiscovery(userId);
  }, [userId]);

  useLayoutEffect(() => {
    syncCallV4NativeAcceptInflightFromWindowLocation();
    syncCallV4NativeAcceptingSurfaceFromWindowLocation();
    const path = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    if (!path.includes("/community-messenger/calls-v4/")) return;
    if (isCallV4CalleeRejectRoute(path)) {
      const callId = readCallV4SessionIdFromNativeRoute(path);
      if (callId) void callV4HandleRejectRoute(callId, router);
      return;
    }
    if (isCallV4CalleeAcceptRoute(path)) {
      logCallV4RouteAcceptDetected(path);
      seedCallV4NativeAcceptRouteState(path);
      if (shouldRegisterCallV4NativeAcceptingFromRoute(path)) {
        registerCallV4NativeAcceptingFromAppPath(path);
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    const onNativeRoute = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path?.trim();
      if (!path) return;
      const currentPath = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
      handleCallV4NativeRouteEvent(path, router, currentPath);
    };

    window.addEventListener("dibay:call-route", onNativeRoute);
    window.addEventListener("dibay:push-route", onNativeRoute);
    return () => {
      window.removeEventListener("dibay:call-route", onNativeRoute);
      window.removeEventListener("dibay:push-route", onNativeRoute);
    };
  }, [pathname, router]);

  useEffect(() => {
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
      maybeFinalizeCallV4FromVoipSurfaceOwnerBridge(detail);
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

  return (
    <>
      <CallV4IncomingSheet />
      <CallV4ActiveCallHost />
      {children}
    </>
  );
}

/** V4 lane — Android sync-only + desktop establishment. */
export function CallV4Provider({ children }: CallV4ProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const syncOnly = isLegacyWebCallEstablishmentRemoved();

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return startNativeConnectedSync();
  }, []);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;
    return registerCallV4ConnectedTerminalHandler((callId, status, source) =>
      callV4HandleRemoteTerminal(callId, status, readCallV4ExitRouter() ?? router, source),
    );
  }, [router]);

  useEffect(() => {
    if (!shouldMountCallV4Companion() || !userId) return;
    return startCallV4TerminalRealtimeWatch(userId);
  }, [userId]);

  useEffect(() => {
    if (!shouldMountCallV4Companion()) return;

    logCallV4("provider_ready", { syncOnly });

    const offBridge = installDibayFcmCallBridge({
      onIncomingWake: syncOnly
        ? () => {}
        : (detail) => {
            void hydrateCallV4IncomingWake(detail);
          },
      onFcmTerminal: (detail) => {
        void callV4HandleRemoteTerminal(
          detail.callId,
          detail.terminalKind,
          readCallV4ExitRouter() ?? router,
          "fcm",
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
  }, [router, syncOnly]);

  if (!shouldMountCallV4Companion()) return children ?? null;

  if (syncOnly) {
    return <>{children}</>;
  }

  return (
    <CallV4WebEstablishmentHost pathname={pathname} router={router} userId={userId}>
      {children}
    </CallV4WebEstablishmentHost>
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
