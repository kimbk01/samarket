"use client";

import { useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearDibayCallPendingRoute,
  readDibayCallPendingRoute,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { shouldReplaceRoute } from "@/lib/push/push-route-policy";
import {
  clearNativePersistedCallPendingRoute,
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
import { callEngineActions } from "@/lib/community-messenger/call-engine";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";

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
function DibayFcmCallRouteHostInner() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);

  useLayoutEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    let mounted = true;

    const navigate = (rawPath: string) => {
      const path = rawPath.trim();
      if (!path.startsWith("/community-messenger/calls/")) return;

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
      const sessionId = readCalleeAcceptSessionIdFromPath(path);
      if (sessionId && shouldReplaceRoute(path)) {
        if (!callEngineActions.replaceRouteOnce(router, sessionId, path)) {
          router.replace(path);
        }
      } else if (shouldReplaceRoute(path)) {
        router.replace(path);
      } else {
        router.push(path);
      }
      void clearNativePersistedCallPendingRoute();
      console.info("[call-route] webview_route_delivered", { path });
    };

    const consumePendingRoutes = async () => {
      const sessionPending = readDibayCallPendingRoute();
      if (sessionPending) {
        console.info("[call-route] pending_route_replayed", { path: sessionPending, source: "session" });
        navigate(sessionPending);
        return;
      }
      const nativePending = await readNativePersistedCallPendingRoute();
      if (!mounted) return;
      if (nativePending) {
        console.info("[call-route] pending_route_replayed", { path: nativePending.path, source: "native" });
        navigate(nativePending.path);
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
      navigate(path);
    };

    window.addEventListener("dibay:call-route", onCallRoute);
    window.addEventListener("focus", maybeConsumeOnResume);
    document.addEventListener("visibilitychange", maybeConsumeOnResume);
    return () => {
      mounted = false;
      offTerminal();
      window.removeEventListener("dibay:call-route", onCallRoute);
      window.removeEventListener("focus", maybeConsumeOnResume);
      document.removeEventListener("visibilitychange", maybeConsumeOnResume);
    };
  }, [router]);

  return null;
}

/** V3 Safe Lane: native call routes are handled by `CallV3Provider`, not CallEngine. */
export function DibayFcmCallRouteHost() {
  if (isDibayCallV3SafeLaneEnabled()) return null;
  return <DibayFcmCallRouteHostInner />;
}
