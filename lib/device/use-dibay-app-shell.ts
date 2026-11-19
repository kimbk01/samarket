"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  DIBAY_PRE_RESOLUTION_UNKNOWN,
  readDibayDeviceClassSync,
} from "@/lib/device/dibay-device-class-hydrate";
import { startDibayDeviceClassResolution, type DibayDeviceClassResult } from "@/lib/device/dibay-device-class";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import { measureUsableWindow } from "@/lib/device/dibay-window-class";
import { resolveAppShell, type DibayAppShellResolution } from "@/lib/device/dibay-shell-resolver";
import { useAppViewportSize } from "@/lib/ui/use-app-viewport-size";
import { setDibayShellSnapshot } from "@/lib/device/dibay-shell-snapshot";

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
    /** D2 (2026-11-19) — 네이티브 판정 실패면 정해진 횟수만 다시 판정해 맥·태블릿 세로 메뉴로 회복한다 */
    const stop = startDibayDeviceClassResolution((resolved) => {
      if (!cancelled) setDevice(resolved);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const usableWidthPx = useMemo(() => {
    if (typeof window === "undefined") return 0;
    return measureUsableWindow().usableWidth;
  }, [viewport.width, viewport.height, viewport.visualHeight]);

  /**
   * v4 태블릿 세로 = 하단 탭 — 창 높이는 `innerHeight`(iOS 는 키보드로 줄지 않음), 방향은 `screen.orientation`
   * (키보드와 무관). 회전하면 viewport 크기가 바뀌어 다시 읽는다.
   */
  const { usableHeightPx, screenOrientation } = useMemo(() => {
    if (typeof window === "undefined") return { usableHeightPx: 0, screenOrientation: null };
    const type = window.screen?.orientation?.type ?? "";
    const orient: "portrait" | "landscape" | null = type.startsWith("portrait")
      ? "portrait"
      : type.startsWith("landscape")
        ? "landscape"
        : null;
    return { usableHeightPx: window.innerHeight, screenOrientation: orient };
  }, [viewport.width, viewport.height]);

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
    usableWidthPx,
    usableHeightPx,
    screenOrientation,
    keyboardOpen: layout.keyboardOpen,
  });

  /** D3 — 진입 계측이 읽는 셸 사진(기기 판정·메뉴 형태·창 폭) */
  const navKind: "rail" | "bottom" = shell.navigationPresentation === "DESKTOP_SIDE_RAIL" ? "rail" : "bottom";
  useEffect(() => {
    setDibayShellSnapshot({
      deviceClass: device.deviceClass,
      deviceClassSource: device.source ?? null,
      nav: navKind,
      usableWidth: Math.round(usableWidthPx),
    });
  }, [device.deviceClass, device.source, navKind, usableWidthPx]);

  return {
    ...shell,
    device,
    usableWidthPx,
    resolved: device.reason !== "pre_resolution",
  };
}
