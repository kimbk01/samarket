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
import {
  buildCalleeAcceptActiveSessionSeed,
  readCallAcceptHydratePeer,
} from "@/lib/community-messenger/call-accept-hydrate-peer";
import { primeCommunityMessengerCallNavigationSeed } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  isNativeCalleeAcceptCompletedRoute,
  isNativeCalleeAcceptOwnedRoute,
  readNativeCalleeAcceptRouteParams,
} from "@/lib/community-messenger/native-callee-accept-entry";
import {
  claimIncomingCallSurface,
  isRingingOnlyIncomingCallRoute,
} from "@/lib/community-messenger/incoming-call-surface-owner";
import { resolveCallRouteResumeDecision } from "@/lib/community-messenger/call-route-resume-guard";

const ROUTE_DEDUPE_MS = 2_000;

function readCalleeAcceptSessionIdFromPath(path: string): string | null {
  const match = path.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

function isCalleeAcceptCallRoute(path: string): boolean {
  return path.includes("action=accept") || path.includes("callAction=accept");
}

function readAcceptRouteParamsFromPath(path: string) {
  const qIdx = path.indexOf("?");
  const search = qIdx >= 0 ? path.slice(qIdx + 1) : "";
  return readNativeCalleeAcceptRouteParams(new URLSearchParams(search));
}

function isNativeAcceptPatchCompleteRoute(path: string): boolean {
  return isNativeCalleeAcceptCompletedRoute(readAcceptRouteParamsFromPath(path));
}

function isNativeAcceptOwnedRoute(path: string): boolean {
  return isNativeCalleeAcceptOwnedRoute(readAcceptRouteParamsFromPath(path));
}

function resolveNativeAcceptSource(path: string): "native_notification_accept" | "native_activity_accept" {
  return path.includes("source=activity") ? "native_activity_accept" : "native_notification_accept";
}

/** Android native accept/route → 단일 accept gateway (replace 는 gateway 만) */
export function DibayFcmCallRouteHost() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);

  useLayoutEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    let mounted = true;

    const navigate = (rawPath: string) => {
      const path = rawPath.trim();
      if (!path.startsWith("/community-messenger/calls/")) return;

      const sessionId = extractDibayCallSessionIdFromPath(path);
      const now = Date.now();
      if (!dibayRouteLaneAllow(path)) {
        clearDibayCallPendingRoute();
        void clearNativePersistedCallPendingRoute();
        logDibayCall("state_end", {
          path,
          sessionId: sessionId ?? undefined,
          source: "stale_call_route_blocked",
        });
        return;
      }

      const validateAndContinue = (onAllowed: () => void) => {
        if (!sessionId) {
          onAllowed();
          return;
        }
        void resolveCallRouteResumeDecision({ sessionId, path }).then((decision) => {
          if (!mounted) return;
          if (decision.action === "block") {
            clearDibayCallPendingRoute();
            void clearNativePersistedCallPendingRoute();
            if (sessionId) dibayCallSealTerminal(sessionId);
            logDibayCall("stale_ringing_blocked", {
              path,
              sessionId,
              callId: sessionId,
              source: `pending_route_${decision.reason}`,
            });
            console.info("[call-route] resume_guard_blocked", { path, reason: decision.reason });
            return;
          }
          onAllowed();
        });
      };

      /** Ringing pending route — Native full-screen owns UI; WebView `/calls/:id` 중복 모달 방지 */
      if (isRingingOnlyIncomingCallRoute(path)) {
        const ringingCallId = sessionId;
        if (ringingCallId) {
          claimIncomingCallSurface(ringingCallId, "native_fullscreen", "pending_route_blocked");
        }
        clearDibayCallPendingRoute();
        void clearNativePersistedCallPendingRoute();
        logDibayCall("stale_ringing_blocked", {
          path,
          sessionId: ringingCallId ?? undefined,
          callId: ringingCallId ?? undefined,
          source: "ringing_only_pending_route",
        });
        console.info("[call-route] ringing_only_route_blocked", { path, callId: ringingCallId });
        return;
      }

      validateAndContinue(() => {
        if (path.includes("source=native_resume")) {
          logDibayCall("notification_resume_route", {
            sessionId: sessionId ?? undefined,
            callId: sessionId ?? undefined,
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
            if (isNativeAcceptOwnedRoute(path)) {
              const hydratePeer = readCallAcceptHydratePeer(acceptSessionId);
              if (hydratePeer && isNativeAcceptPatchCompleteRoute(path)) {
                primeCommunityMessengerCallNavigationSeed(
                  acceptSessionId,
                  buildCalleeAcceptActiveSessionSeed(hydratePeer)
                );
              }
              const currentPath =
                typeof window !== "undefined"
                  ? `${window.location.pathname}${window.location.search}`
                  : "";
              if (currentPath !== path) {
                router.replace(path);
              }
              console.info("[call-route] webview_route_delivered", {
                path,
                via: "accept_route_active",
                skippedReplace: currentPath === path,
              });
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
      });
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
