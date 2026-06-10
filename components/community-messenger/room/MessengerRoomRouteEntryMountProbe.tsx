"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { beginR2M9RouteMountedT0, noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import {
  noteR2M10RouteChangeStart,
  noteR2M10RoutePageMount,
} from "@/lib/community-messenger/room/cm-room-r2-m10-route-transition";
import { noteR2M11RouteChangeStart } from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import { noteR2M11BRouteChangeStart } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteR2M11DRoomRouteChange } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";
import { ensureCmRoomEntryRouteT0 } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { acquireCmRoomEntryTimingSession } from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import {
  ensureRouteEntryPerfStarted,
  recordRouteEntryElapsedMetricOnce,
} from "@/lib/runtime/samarket-runtime-debug";
import { noteTradeChatEntryJourneyMilestone } from "@/lib/trade/trade-chat-entry-journey-perf";
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";

function isMessengerRoomPath(pathname: string): boolean {
  return pathname.startsWith("/community-messenger/rooms/");
}

function roomIdFromPath(pathname: string): string {
  const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  return m?.[1]?.trim() ?? "";
}

export function MessengerRoomRouteEntryMountProbe({ stage }: { stage: "layout" | "page" }) {
  const pathname = usePathname() ?? "";
  const match = isMessengerRoomPath(pathname);
  const roomId = match ? roomIdFromPath(pathname) : "";

  if (match) {
    if (stage === "layout") {
      ensureRouteEntryPerfStarted("messenger_room_entry", pathname);
      if (roomId) {
        acquireCmRoomEntryTimingSession(roomId, "route_t0_fallback");
        ensureCmRoomEntryRouteT0();
      }
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "next_route_start_ms");
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "layout_mount_start_ms");
      noteR2M9Stage("route_layout_mount");
      if (roomId) {
        noteR2M10RouteChangeStart(roomId);
        noteR2M11RouteChangeStart(roomId);
        noteR2M11BRouteChangeStart(roomId);
        noteR2M11DRoomRouteChange(roomId);
      }
    } else {
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_mount_start_ms");
      beginR2M9RouteMountedT0();
      if (roomId) noteR2M10RoutePageMount(roomId);
    }
  }

  useLayoutEffect(() => {
    if (!match) return;
    if (stage === "layout") {
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "layout_mount_end_ms");
      return;
    }
    recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_mount_end_ms");
    if (readTradeChatEntryMark()) {
      noteTradeChatEntryJourneyMilestone("room_page_mounted");
    }
  }, [match, stage]);

  return null;
}
