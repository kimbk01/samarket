"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  tryCaptureR2M11BFlightFromPerformance,
  noteR2M11BFlightResponseDone,
  noteR2M11BFlightResponseStart,
} from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";

function roomIdFromPath(pathname: string): string {
  const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  return m?.[1]?.trim() ?? "";
}

/** R2-M11B — App Router RSC flight fetch 구간(PerformanceResourceTiming). */
export function MessengerRoomR2M11BFlightProbe() {
  const pathname = usePathname() ?? "";
  const roomId = roomIdFromPath(pathname);
  const match = Boolean(roomId);

  useLayoutEffect(() => {
    if (!match || !samarketRuntimeDebugEnabled()) return;
    tryCaptureR2M11BFlightFromPerformance(roomId);
    const raf = requestAnimationFrame(() => {
      tryCaptureR2M11BFlightFromPerformance(roomId);
    });
    const t = window.setTimeout(() => {
      tryCaptureR2M11BFlightFromPerformance(roomId);
    }, 0);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [match, roomId, pathname]);

  useLayoutEffect(() => {
    if (!match || !samarketRuntimeDebugEnabled() || typeof PerformanceObserver === "undefined") return;
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry instanceof PerformanceResourceTiming)) continue;
        const name = entry.name;
        if (!name.includes("_rsc=") || !name.includes(roomId)) continue;
        noteR2M11BFlightResponseStart(roomId, entry.fetchStart > 0 ? entry.fetchStart : entry.startTime);
        if (entry.responseEnd > 0) {
          noteR2M11BFlightResponseDone(roomId, entry.responseEnd);
        }
      }
    });
    try {
      obs.observe({ type: "resource", buffered: true });
    } catch {
      return;
    }
    return () => obs.disconnect();
  }, [match, roomId, pathname]);

  return null;
}
