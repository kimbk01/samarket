"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import type { R2M11CLayoutServerPayload } from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";
import { noteR2M11CLayoutServerPayload } from "@/lib/community-messenger/room/cm-room-r2-m11c-breakdown";

function roomIdFromPath(pathname: string): string {
  const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  return m?.[1]?.trim() ?? "";
}

/** R2-M11C — `(main) layout` 서버 타이밍을 room 세션에 기록. */
export function MessengerRoomR2M11CLayoutTimingBridge({
  layoutTiming,
}: {
  layoutTiming: R2M11CLayoutServerPayload;
}) {
  const pathname = usePathname() ?? "";
  const roomId = roomIdFromPath(pathname);

  useLayoutEffect(() => {
    if (!roomId) return;
    noteR2M11CLayoutServerPayload(roomId, layoutTiming);
  }, [roomId, layoutTiming]);

  return null;
}
