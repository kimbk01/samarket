"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import {
  DIBAY_PRE_RESOLUTION_UNKNOWN,
  readDibayDeviceClassSync,
} from "@/lib/device/dibay-device-class-hydrate";
import { resolveDibayDeviceClass, type DibayDeviceClassResult } from "@/lib/device/dibay-device-class";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import { measureUsableWindow } from "@/lib/device/dibay-window-class";
import { resolveAppShell, type DibayAppShellResolution } from "@/lib/device/dibay-shell-resolver";
import { useAppViewportSize } from "@/lib/ui/use-app-viewport-size";

export type DibayAppShellAuthority = DibayAppShellResolution & {
  device: DibayDeviceClassResult;
  usableWidthPx: number;
  resolved: boolean;
};

/**
 * App-shell consumer of FD1 + FD2.
 * First render is UNKNOWN_SAFE so SSR/hydration never default to Phone.
 * Navigation presentation stays EXISTING_MAIN_BOTTOM_NAV — no remount on resolve.
 */
export function useDibayAppShellAuthority(): DibayAppShellAuthority {
  const viewport = useAppViewportSize();
  const [device, setDevice] = useState<DibayDeviceClassResult>(DIBAY_PRE_RESOLUTION_UNKNOWN);

  useLayoutEffect(() => {
    let cancelled = false;
    const sync = readDibayDeviceClassSync();
    if (sync.deviceClass !== "UNKNOWN") {
      setDevice(sync);
    }
    void resolveDibayDeviceClass().then((resolved) => {
      if (!cancelled) setDevice(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const usableWidthPx = useMemo(() => {
    if (typeof window === "undefined") return 0;
    return measureUsableWindow().usableWidth;
  }, [viewport.width, viewport.height, viewport.visualHeight]);

  const layout = resolveLayoutMode({
    deviceClass: device.deviceClass,
    usableWidthPx,
    domain: "community",
    keyboardOpen: false,
  });

  const shell = resolveAppShell({
    deviceClass: device.deviceClass,
    layoutMode: layout.layoutMode,
    windowClass: layout.windowClass,
    keyboardOpen: layout.keyboardOpen,
  });

  return {
    ...shell,
    device,
    usableWidthPx,
    resolved: device.reason !== "pre_resolution",
  };
}
