"use client";

import { memo, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
 * Cold/first-entry wait — spinner buffering (not blank white, not ShellChromeFrame).
 * Warm cache path mounts RoomClient immediately and skips this.
 */
export const CommunityMessengerRoomEntryEmpty = memo(function CommunityMessengerRoomEntryEmpty({
  roomId,
  recordShellPaint = true,
  recordSegmentFallback = false,
  recordPass1Milestones = false,
  dataAttrs,
}: {
  roomId?: string;
  recordShellPaint?: boolean;
  recordSegmentFallback?: boolean;
  recordPass1Milestones?: boolean;
  dataAttrs?: Record<string, string | undefined>;
}) {
  const { safeT } = useI18n();
  const params = useParams();
  const resolvedRoomId = roomId?.trim() || String(params?.roomId ?? "").trim();
  const enteringLabel = safeT("cm_ui_entering", {
    fallbackKo: "채팅방 입장 중…",
    fallbackEn: "Entering chat…",
  });

  useLayoutEffect(() => {
    if (recordSegmentFallback) noteR2M11SegmentLoadingFallbackVisible();
    const rid = resolvedRoomId;
    if (!rid) return;
    if (recordShellPaint) {
      noteCmRoomEntryShellFirstPaint(rid);
      noteCmRoomStableShellPainted(rid);
    }
    if (recordPass1Milestones) {
      noteR2M11SuspenseRelease(rid);
      noteR2M11BSuspenseRelease(rid);
      noteR2M11DRoomSuspenseRelease(rid);
    }
  }, [recordPass1Milestones, recordSegmentFallback, recordShellPaint, resolvedRoomId]);

  return (
    <div
      data-messenger-shell
      data-cm-room
      data-cm-room-entry-empty=""
      data-cm-room-entry-buffering=""
      {...dataAttrs}
      className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={enteringLabel}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[color:var(--cm-room-chat-bg)]">
        <Loader2
          className="h-8 w-8 animate-spin text-[color:var(--cm-room-primary)]"
          aria-hidden
        />
        <p className="sam-text-body text-[color:var(--cm-room-text-muted)]">{enteringLabel}</p>
      </div>
    </div>
  );
});
