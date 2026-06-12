"use client";

import { useLayoutEffect } from "react";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";

/** BN14 — segment shell host·route entry shell DOM 가시 시점 */
export function MessengerRoomBn14DirectColdDomProbe() {
  useLayoutEffect(() => {
    if (document.querySelector("[data-cm-room-segment-shell-host]")) {
      noteBn14DirectColdMark("segment_shell_host_dom");
    }
    if (document.querySelector("[data-cm-room-route-entry-shell]")) {
      noteBn14DirectColdMark("route_entry_shell_dom");
    }
  }, []);
  return null;
}
