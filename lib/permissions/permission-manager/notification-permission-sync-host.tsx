"use client";

import { useEffect, useRef } from "react";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { clearNotificationRequiredBlocked } from "@/lib/permissions/permission-manager/notification-permission-block-store";

/**
 * App start / foreground resume — sync notification composite only (no app modal / OS reprompt).
 */
export function NotificationPermissionSyncHost() {
  const lastReceiveReadyRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) {
      return;
    }

    let cancelled = false;

    const runSync = async (source: "mount" | "visibility" | "app_state") => {
      const snapshot = await syncNotificationState(source === "mount" ? undefined : { force: true });
      if (cancelled) return;

      lastReceiveReadyRef.current = snapshot.receiveReady;

      if (snapshot.receiveReady) {
        clearNotificationRequiredBlocked();
      }
    };

    void runSync("mount");

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runSync("visibility");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    let appStateHandle: { remove: () => void } | null = null;
    if (isCapacitorNativePlatform()) {
      void import("@capacitor/app").then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void runSync("app_state");
        }).then((handle) => {
          appStateHandle = handle;
        }),
      );
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      appStateHandle?.remove();
    };
  }, []);

  return null;
}
