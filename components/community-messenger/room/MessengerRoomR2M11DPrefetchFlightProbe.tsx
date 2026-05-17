"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  observeR2M11DRoomRscFlightResource,
  tryEmitR2M11DPrefetchBreakdown,
} from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function roomIdFromPath(pathname: string): string {
  const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  return m?.[1]?.trim() ?? "";
}

/** R2-M11D — room RSC flight PerformanceObserver (계측 전용). */
export function MessengerRoomR2M11DPrefetchFlightProbe() {
  const pathname = usePathname() ?? "";
  const roomId = roomIdFromPath(pathname);

  useLayoutEffect(() => {
    if (!samarketRuntimeDebugEnabled() || typeof PerformanceObserver === "undefined") return;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry instanceof PerformanceResourceTiming) {
          observeR2M11DRoomRscFlightResource(entry);
        }
      }
    });
    try {
      obs.observe({ type: "resource", buffered: true });
    } catch {
      return;
    }
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!roomId || !samarketRuntimeDebugEnabled()) return;
    const raf = requestAnimationFrame(() => {
      tryEmitR2M11DPrefetchBreakdown(roomId);
    });
    return () => cancelAnimationFrame(raf);
  }, [roomId, pathname]);

  return null;
}
