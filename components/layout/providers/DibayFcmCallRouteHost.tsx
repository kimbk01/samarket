"use client";

import { useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearDibayCallPendingRoute,
  readDibayCallPendingRoute,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import {
  isNativeIncomingHydrateRoute,
  readIncomingCallVisibilityState,
  shouldReplayCallPendingRoute,
} from "@/lib/community-messenger/incoming-call-ui-policy";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { shouldReplaceRoute } from "@/lib/push/push-route-policy";
import {
  clearNativePersistedCallPendingRoute,
  getNativeIncomingCallPlugin,
  readNativePersistedCallPendingRoute,
} from "@/lib/push/native/push-route-native-bridge";
import {
  dibayCallSealTerminal,
  dibayRouteLaneAllow,
} from "@/lib/community-messenger/call-lifecycle";
import {
  extractDibayCallSessionIdFromPath,
  logDibayCall,
} from "@/lib/community-messenger/call-orchestrator";
import { runNativePendingAcceptCall } from "@/lib/community-messenger/incoming-call-accept-gateway";

const ROUTE_DEDUPE_MS = 2_000;

function readCalleeAcceptSessionIdFromPath(path: string): string | null {
  const match = path.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

function isCalleeAcceptCallRoute(path: string): boolean {
  return path.includes("action=accept") || path.includes("callAction=accept");
}

function isNativeAcceptPatchCompleteRoute(path: string): boolean {
  return path.includes("nativeAccept=1");
}

function resolveNativeAcceptSource(path: string): "native_notification_accept" | "native_activity_accept" {
  return path.includes("source=activity") ? "native_activity_accept" : "native_notification_accept";
}

/** Android native accept/route → 단일 accept gateway (replace 는 gateway 만) */
export function DibayFcmCallRouteHost() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);
  const nativeForegroundIncomingCallIdRef = useRef<string | null>(null);
  const capacitorAppActiveRef = useRef(true);

  useLayoutEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    let mounted = true;
    let removeAppStateListener: (() => void) | undefined;

    const readRoutePolicyContext = async () => {
      let capacitorAppActive = capacitorAppActiveRef.current;
      try {
        const { App } = await import("@capacitor/app");
        const state = await App.getState();
        capacitorAppActive = state.isActive;
        capacitorAppActiveRef.current = state.isActive;
      } catch {
        /* best-effort */
      }

      let nativeForegroundIncomingCallId = nativeForegroundIncomingCallIdRef.current;
      try {
        const plugin = await getNativeIncomingCallPlugin();
        const res = await plugin?.getForegroundIncomingCallId();
        nativeForegroundIncomingCallId = res?.callId?.trim() || null;
        nativeForegroundIncomingCallIdRef.current = nativeForegroundIncomingCallId;
      } catch {
        /* best-effort */
      }

      return {
        capacitorAppActive,
        visibilityState: readIncomingCallVisibilityState(),
        nativeForegroundIncomingCallId,
      };
    };

    const navigate = async (rawPath: string) => {
      const path = rawPath.trim();
      if (!path.startsWith("/community-messenger/calls/")) return;

      const policyCtx = await readRoutePolicyContext();
      const replay = shouldReplayCallPendingRoute(path, policyCtx);
      if (!replay.allow) {
        if (isNativeIncomingHydrateRoute(path)) {
          clearDibayCallPendingRoute();
          void clearNativePersistedCallPendingRoute();
        }
        logDibayCall("pending_route_deferred", {
          path,
          sessionId: extractDibayCallSessionIdFromPath(path) ?? undefined,
          source: replay.reason,
        });
        console.info("[call-route] pending_route_deferred", { path, reason: replay.reason });
        return;
      }

      const now = Date.now();
      if (!dibayRouteLaneAllow(path)) {
        clearDibayCallPendingRoute();
        void clearNativePersistedCallPendingRoute();
        logDibayCall("state_end", {
          path,
          sessionId: extractDibayCallSessionIdFromPath(path) ?? undefined,
          source: "stale_call_route_blocked",
        });
        return;
      }
      if (path.includes("source=native_resume")) {
        logDibayCall("notification_resume_route", {
          sessionId: extractDibayCallSessionIdFromPath(path) ?? undefined,
          callId: extractDibayCallSessionIdFromPath(path) ?? undefined,
          path,
          source: "native_resume",
        });
      }
      const last = lastRouteRef.current;
      if (last && last.path === path && now - last.at < ROUTE_DEDUPE_MS) {
        console.info("[call-route] duplicate_ignored", { path });
        return;
      }
      lastRouteRef.current = { path, at: now };

      console.info("[call-route] route_resolved", { path });

      if (isCalleeAcceptCallRoute(path)) {
        const acceptSessionId = readCalleeAcceptSessionIdFromPath(path);
        if (acceptSessionId) {
          clearDibayCallPendingRoute();
          void clearNativePersistedCallPendingRoute();
          if (isNativeAcceptPatchCompleteRoute(path)) {
            router.replace(path);
            console.info("[call-route] webview_route_delivered", { path, via: "accept_route_active" });
            return;
          }
          void runNativePendingAcceptCall(router, acceptSessionId, resolveNativeAcceptSource(path)).then(
            (result) => {
              console.info("[call-route] native_pending_accept_done", {
                sessionId: acceptSessionId,
                ok: result.ok,
                reason: result.reason,
              });
            }
          );
          console.info("[call-route] webview_route_delivered", { path, via: "native_pending_accept" });
          return;
        }
      }

      clearDibayCallPendingRoute();
      if (shouldReplaceRoute(path)) {
        router.replace(path);
      } else {
        router.push(path);
      }
      void clearNativePersistedCallPendingRoute();
      console.info("[call-route] webview_route_delivered", { path });
    };

    const consumePendingRoutes = async () => {
      const policyCtx = await readRoutePolicyContext();
      const sessionPending = readDibayCallPendingRoute();
      if (sessionPending) {
        const replay = shouldReplayCallPendingRoute(sessionPending, policyCtx);
        if (!replay.allow) {
          console.info("[call-route] pending_route_deferred", {
            path: sessionPending,
            source: "session",
            reason: replay.reason,
          });
          return;
        }
        console.info("[call-route] pending_route_replayed", { path: sessionPending, source: "session" });
        await navigate(sessionPending);
        return;
      }
      const nativePending = await readNativePersistedCallPendingRoute();
      if (!mounted) return;
      if (nativePending) {
        const replay = shouldReplayCallPendingRoute(nativePending.path, policyCtx);
        if (!replay.allow) {
          console.info("[call-route] pending_route_deferred", {
            path: nativePending.path,
            source: "native",
            reason: replay.reason,
          });
          return;
        }
        console.info("[call-route] pending_route_replayed", { path: nativePending.path, source: "native" });
        await navigate(nativePending.path);
      }
    };

    void consumePendingRoutes();

    const maybeConsumeOnResume = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void consumePendingRoutes();
    };

    const offTerminal = onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.call.session_terminal") return;
      const sid = ev.sessionId?.trim();
      if (sid) dibayCallSealTerminal(sid);
    });

    const onCallRoute = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      const path = detail?.path?.trim();
      if (!path) return;
      console.info("[call-route] notification_tap_received", { path });
      void navigate(path);
    };

    const onForegroundIncomingUi = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; sessionId?: string; visible?: boolean }>).detail;
      if (detail?.type !== "foreground_incoming_ui") return;
      const sessionId = detail.sessionId?.trim() ?? "";
      nativeForegroundIncomingCallIdRef.current =
        detail.visible !== false && sessionId ? sessionId : null;
    };

    window.addEventListener("dibay:call-route", onCallRoute);
    window.addEventListener("dibay:call-event", onForegroundIncomingUi);
    window.addEventListener("focus", maybeConsumeOnResume);
    document.addEventListener("visibilitychange", maybeConsumeOnResume);

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appStateChange", ({ isActive }) => {
          capacitorAppActiveRef.current = isActive;
          if (isActive) void consumePendingRoutes();
        });
        if (!mounted) {
          void sub.remove();
          return;
        }
        removeAppStateListener = () => {
          void sub.remove();
        };
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      mounted = false;
      offTerminal();
      window.removeEventListener("dibay:call-route", onCallRoute);
      window.removeEventListener("dibay:call-event", onForegroundIncomingUi);
      window.removeEventListener("focus", maybeConsumeOnResume);
      document.removeEventListener("visibilitychange", maybeConsumeOnResume);
      removeAppStateListener?.();
    };
  }, [router]);

  return null;
}
