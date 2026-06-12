"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { warmCommunityMessengerRoomRouteChunks } from "@/lib/community-messenger/room/cm-room-route-chunk-warm";
import { scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";

function isCommunityMessengerHubPath(pathname: string): boolean {
  const p = pathname.trim();
  if (!p.startsWith("/community-messenger")) return false;
  return !p.includes("/rooms/");
}

/**
 * BN13-rsc 5차 — CM hub/list 화면 노출 시 room layout·entry chunk 선행 warm (CM 세그먼트 한정).
 */
export function CommunityMessengerRoomRouteChunkWarmHubVisible() {
  const pathname = usePathname() ?? "";
  const enabled = isCommunityMessengerHubPath(pathname);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    queueMicrotask(() => {
      warmCommunityMessengerRoomRouteChunks("cm_hub_visible", { layoutOnly: true });
    });
    const idleId = scheduleWhenBrowserIdle(() => {
      warmCommunityMessengerRoomRouteChunks("cm_hub_visible");
    }, 80);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [enabled]);

  return null;
}
