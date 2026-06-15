"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { isAuthRequiredPushRoute } from "@/lib/push/resolve-push-route-from-fcm-data";

const ROUTE_DEDUPE_MS = 2_000;
const NOTIFICATION_DEDUPE_MS = 60_000;
const NOTIFICATION_DEDUPE_KEY = "dibay_push_route_notification_ids";

type PushRouteDetail = {
  path?: string;
  notificationId?: string;
};

function readNotificationDedupe(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = sessionStorage.getItem(NOTIFICATION_DEDUPE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeNotificationDedupe(map: Map<string, number>): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const pruned = Object.fromEntries(
    [...map.entries()].filter(([, at]) => now - at < NOTIFICATION_DEDUPE_MS)
  );
  sessionStorage.setItem(NOTIFICATION_DEDUPE_KEY, JSON.stringify(pruned));
}

function shouldIgnoreNotification(notificationId: string | undefined): boolean {
  const id = notificationId?.trim();
  if (!id) return false;
  const map = readNotificationDedupe();
  const prev = map.get(id);
  const now = Date.now();
  if (prev != null && now - prev < NOTIFICATION_DEDUPE_MS) {
    console.info("[push-route] duplicate_ignored", { notificationId: id });
    return true;
  }
  map.set(id, now);
  writeNotificationDedupe(map);
  return false;
}

/**
 * Native FCM notification tap / dibay deep link → Next.js router navigation.
 */
export function PushRouteListener() {
  const router = useRouter();
  const lastRouteRef = useRef<{ path: string; at: number } | null>(null);
  const sessionPhaseRef = useRef(getSessionPhase());

  useEffect(() => subscribeSessionPhase((phase) => {
    sessionPhaseRef.current = phase;
  }), []);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const navigate = (rawPath: string, notificationId?: string) => {
      const path = rawPath.trim();
      if (!path.startsWith("/")) return;
      if (shouldIgnoreNotification(notificationId)) return;

      const now = Date.now();
      const last = lastRouteRef.current;
      if (last && last.path === path && now - last.at < ROUTE_DEDUPE_MS) {
        console.info("[push-route] duplicate_ignored", { path });
        return;
      }
      lastRouteRef.current = { path, at: now };

      console.info("[push-route] route_resolved", { path, notificationId: notificationId ?? null });

      if (sessionPhaseRef.current !== "authenticated" && isAuthRequiredPushRoute(path)) {
        openLoginRequiredSheet({ actionType: "messenger_open", next: path });
        return;
      }

      router.push(path);
      console.info("[push-route] webview_route_delivered", { path });
    };

    const onPushRoute = (event: Event) => {
      const detail = (event as CustomEvent<PushRouteDetail>).detail;
      const path = detail?.path?.trim();
      if (!path) return;
      console.info("[push-route] notification_tap_received", {
        path,
        notificationId: detail.notificationId ?? null,
      });
      navigate(path, detail.notificationId);
    };

    window.addEventListener("dibay:push-route", onPushRoute);

    let removeAppUrlOpen: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const sub = await App.addListener("appUrlOpen", (event) => {
          const url = event.url?.trim() ?? "";
          if (!url.startsWith("dibay://")) return;
          if (url.startsWith("dibay://auth")) return;
          const path = resolveDibayDeepLinkToAppPath(url);
          if (!path) return;
          navigate(path);
        });
        removeAppUrlOpen = () => {
          void sub.remove();
        };
      } catch {
        /* Capacitor App plugin unavailable */
      }
    })();

    return () => {
      window.removeEventListener("dibay:push-route", onPushRoute);
      removeAppUrlOpen?.();
    };
  }, [router]);

  return null;
}
