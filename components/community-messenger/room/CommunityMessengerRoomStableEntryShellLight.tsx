"use client";

import { memo, useLayoutEffect } from "react";
import { CommunityMessengerRoomShellChromeFrame } from "@/components/community-messenger/room/CommunityMessengerRoomShellChromeFrame";
import {
  noteCmRoomEntryShellFirstPaint,
  noteCmRoomStableShellPainted,
} from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";
import {
  noteR2M11SegmentLoadingFallbackVisible,
  noteR2M11SuspenseRelease,
} from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import { noteR2M11BSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteR2M11DRoomSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";
/**
 * BN13-rsc 4차 — layout persistence host 전용 경량 shell.
 * useMatchMaxWidthMd·Pass1Composer 없음 — placeholder footer만.
 */
export const CommunityMessengerRoomStableEntryShellLight = memo(function CommunityMessengerRoomStableEntryShellLight({
  roomId,
  variant = "entry",
  recordShellPaint = true,
}: {
  roomId: string;
  variant?: "segment" | "entry" | "pass1";
  recordShellPaint?: boolean;
}) {
  const resolvedRoomId = roomId.trim();
  const includePass1Milestone = variant === "entry" || variant === "pass1";

  useLayoutEffect(() => {
    if (variant === "segment" || variant === "entry") {
      noteR2M11SegmentLoadingFallbackVisible();
    }
    const rid = resolvedRoomId;
    if (!rid) return;
    if (recordShellPaint) {
      noteCmRoomEntryShellFirstPaint(rid);
      noteCmRoomStableShellPainted(rid);
    }
    if (includePass1Milestone) {
      noteR2M11SuspenseRelease(rid);
      noteR2M11BSuspenseRelease(rid);
      noteR2M11DRoomSuspenseRelease(rid);
    }
  }, [includePass1Milestone, recordShellPaint, resolvedRoomId, variant]);

  const dataAttrs: Record<string, string> = {
    "data-messenger-shell": "",
    "data-cm-room": "",
    "data-cm-room-route-entry-shell": "",
  };
  if (includePass1Milestone) {
    dataAttrs["data-cm-room-pass1-stable-shell"] = "";
  }

  return (
    <CommunityMessengerRoomShellChromeFrame
      narrowViewport
      screenReaderHidden={false}
      dataAttrs={dataAttrs}
    />
  );
});
