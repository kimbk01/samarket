"use client";

import { memo } from "react";
import { CommunityMessengerRoomEntryEmpty } from "@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty";

/** Legacy stable entry name — product paints empty wait, not ShellChromeFrame. */
export type CommunityMessengerRoomStableEntryShellVariant = "segment" | "entry" | "pass1";

export const CommunityMessengerRoomStableEntryShell = memo(function CommunityMessengerRoomStableEntryShell({
  roomId,
  variant = "segment",
  recordShellPaint = true,
}: {
  roomId?: string;
  narrowViewport?: boolean;
  variant?: CommunityMessengerRoomStableEntryShellVariant;
  recordShellPaint?: boolean;
  composerEntryVisible?: boolean;
}) {
  const includePass1Milestone = variant === "entry" || variant === "pass1";
  const recordSegmentFallback = variant === "segment" || variant === "entry";

  return (
    <CommunityMessengerRoomEntryEmpty
      roomId={roomId}
      recordShellPaint={recordShellPaint}
      recordSegmentFallback={recordSegmentFallback}
      recordPass1Milestones={includePass1Milestone}
      dataAttrs={{
        "data-cm-room-route-entry-shell": "",
        ...(includePass1Milestone ? { "data-cm-room-pass1-stable-shell": "" } : {}),
      }}
    />
  );
});
