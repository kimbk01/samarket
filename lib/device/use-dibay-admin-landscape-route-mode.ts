"use client";

import { useEffect } from "react";
import { resolveDibayDeviceClass } from "@/lib/device/dibay-device-class";
import { setDibayAppRouteOrientationMode } from "@/lib/device/dibay-app-orientation-native";
import { shouldRequestAdminLandscapeLock } from "@/lib/device/dibay-orientation-policy";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * Admin v4 §2-2 B·C — while the admin shell is mounted inside the Capacitor shell on a tablet,
 * ask native to lock landscape; release on unmount. Browser / phone: no-op (web guard only).
 */
export function useDibayAdminLandscapeRouteMode(): void {
  useEffect(() => {
    const shell = resolveCapacitorShellPlatform();
    if (shell !== "android" && shell !== "ios") return;
    let disposed = false;
    let requested = false;
    void resolveDibayDeviceClass()
      .then((result) => {
        if (disposed || !shouldRequestAdminLandscapeLock(result.deviceClass)) return;
        requested = true;
        void setDibayAppRouteOrientationMode("ADMIN_LANDSCAPE");
      })
      .catch(() => {
        /* device class unavailable → web guard only */
      });
    return () => {
      disposed = true;
      if (requested) void setDibayAppRouteOrientationMode("DEFAULT");
    };
  }, []);
}
