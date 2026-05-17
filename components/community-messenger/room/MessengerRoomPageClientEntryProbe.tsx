"use client";

import { useEffect, useLayoutEffect } from "react";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { tryCaptureR2M11BFlightFromPerformance } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import {
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryResourceMetricRangeFromResources,
} from "@/lib/runtime/samarket-runtime-debug";

if (typeof window !== "undefined") {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_module_eval_start_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "page_module_eval_end_ms");
}

export function MessengerRoomPageClientEntryProbe() {
  useLayoutEffect(() => {
    noteR2M9Stage("page_client_probe");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    const m = path.match(/\/community-messenger\/rooms\/([^/?#]+)/);
    const rid = m?.[1]?.trim() ?? "";
    if (rid) tryCaptureR2M11BFlightFromPerformance(rid);
    recordRouteEntryResourceMetricRangeFromResources("messenger_room_entry", {
      startMetricSuffix: "route_module_request_start_ms",
      endMetricSuffix: "route_module_request_end_ms",
      matchers: ["_rsc=", path],
      initiatorTypes: ["fetch"],
    });
    recordRouteEntryResourceMetricRangeFromResources("messenger_room_entry", {
      startMetricSuffix: "client_chunk_request_start_ms",
      endMetricSuffix: "client_chunk_request_end_ms",
      matchers: ["/_next/static/chunks/app/(main)/community-messenger/rooms/%5BroomId%5D/page.js"],
      initiatorTypes: ["script"],
    });
  }, []);

  return null;
}
