"use client";

import { useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearDibayCallPendingRoute,
  readDibayCallPendingRoute,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { markNativeCalleeAcceptPending } from "@/lib/community-messenger/native-callee-accept-entry";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { shouldReplaceRoute } from "@/lib/push/push-route-policy";
import {
  clearNativePersistedCallPendingRoute,
  readNativePersistedCallPendingRoute,
} from "@/lib/push/native/push-route-native-bridge";

const ROUTE_DEDUPE_MS = 2_000;

function readCalleeAcceptSessionIdFromPath(path: string): string | null {
  const match = path.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id || null;
}

function isCalleeAcceptCallRoute(path: string): boolean {
  return path.includes("action=accept") || path.includes("callAction=accept");
}

/** Android native accept/route → legacy call page 진입 */
export function DibayFcmCallRouteHost() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);

  useLayoutEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const navigate = (rawPath: string) => {
      const path = rawPath.trim();
      if (!path.startsWith("/community-messenger/calls/")) return;

      const now = Date.now();
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
          markNativeCalleeAcceptPending(acceptSessionId);
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
      const sessionPending = readDibayCallPendingRoute();
      if (sessionPending) {
        console.info("[call-route] pending_route_replayed", { path: sessionPending, source: "session" });
        navigate(sessionPending);
        return;
      }
      const nativePending = await readNativePersistedCallPendingRoute();
      if (nativePending) {
        console.info("[call-route] pending_route_replayed", { path: nativePending.path, source: "native" });
        navigate(nativePending.path);
      }
    };

    void consumePendingRoutes();

    const onCallRoute = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      const path = detail?.path?.trim();
      if (!path) return;
      console.info("[call-route] notification_tap_received", { path });
      navigate(path);
    };

    window.addEventListener("dibay:call-route", onCallRoute);
    return () => {
      window.removeEventListener("dibay:call-route", onCallRoute);
    };
  }, [router]);

  return null;
}
