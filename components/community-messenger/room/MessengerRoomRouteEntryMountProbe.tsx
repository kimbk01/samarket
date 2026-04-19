"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { recordRouteEntryElapsedMetricOnce } from "@/lib/runtime/samarket-runtime-debug";

function isMessengerRoomPath(pathname: string): boolean {
  return pathname.startsWith("/community-messenger/rooms/");
}

export function MessengerRoomRouteEntryMountProbe({ stage }: { stage: "layout" | "page" }) {
  const pathname = usePathname() ?? "";
  const match = isMessengerRoomPath(pathname);

  if (match) {
    if (stage === "layout") {
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "next_route_start_ms");
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "layout_mount_start_ms");
    } else {
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_mount_start_ms");
    }
  }

  useLayoutEffect(() => {
    if (!match) return;
    if (stage === "layout") {
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "layout_mount_end_ms");
      return;
    }
    recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_mount_end_ms");
  }, [match, stage]);

  return null;
}
