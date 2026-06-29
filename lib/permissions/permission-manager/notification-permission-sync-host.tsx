"use client";

import { useEffect, useRef } from "react";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  getCachedNotificationReceiveSnapshot,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";
import { runNotificationGuideFlow } from "@/lib/permissions/permission-manager/notification-onboarding-flow";
import { clearNotificationRequiredBlocked } from "@/lib/permissions/permission-manager/notification-permission-block-store";

/**
 * App start / foreground resume — sync notification composite and re-show guide when OFF.
 */
export function NotificationPermissionSyncHost() {
  const lastReceiveReadyRef = useRef<boolean | null>(null);
  const guideRunningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const runSync = async (source: "mount" | "visibility" | "app_state") => {
      const snapshot = await syncNotificationState();
      if (cancelled) return;

      const prev = lastReceiveReadyRef.current;
      lastReceiveReadyRef.current = snapshot.receiveReady;

      if (snapshot.receiveReady) {
        clearNotificationRequiredBlocked();
        return;
      }

      const lostReady = prev === true && !snapshot.receiveReady;
      const shouldPrompt = lostReady || (source === "visibility" && !snapshot.receiveReady);

      if (!shouldPrompt || guideRunningRef.current) return;
      if (source === "mount" && getCachedNotificationReceiveSnapshot()?.receiveReady) return;

      guideRunningRef.current = true;
      try {
        await runNotificationGuideFlow(lostReady ? "disabled_resume" : "settings_retry");
      } finally {
        guideRunningRef.current = false;
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
