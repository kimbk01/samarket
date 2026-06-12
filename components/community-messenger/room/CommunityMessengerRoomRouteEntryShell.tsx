"use client";

import { memo } from "react";
import { CommunityMessengerRoomStableEntryShell } from "@/components/community-messenger/room/CommunityMessengerRoomStableEntryShell";

/** BN13 — segment Suspense·dynamic import 대기 중 안정 room shell 즉시 노출. */
export const CommunityMessengerRoomRouteEntryShell = memo(function CommunityMessengerRoomRouteEntryShell({
  roomId,
  recordShellPaint = true,
}: {
  roomId?: string;
  /** false — shell-first-pass 조기 종료 방지(legacy; entry shell은 PageClientEntry에서 record) */
  recordShellPaint?: boolean;
}) {
  return (
    <CommunityMessengerRoomStableEntryShell
      roomId={roomId}
      variant="segment"
      recordShellPaint={recordShellPaint}
    />
  );
});
