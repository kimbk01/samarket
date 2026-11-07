"use client";

import { memo, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerSplitRoomEntryFrame } from "@/components/community-messenger/room/MessengerSplitRoomEntryFrame";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
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
  onRetryAfterFailure,
}: {
  roomId?: string;
  recordShellPaint?: boolean;
  recordSegmentFallback?: boolean;
  recordPass1Milestones?: boolean;
  dataAttrs?: Record<string, string | undefined>;
  /** 지정 시 입장 실패(일시 오류) 상태 — 스피너 대신 실패 문구·다시 시도 */
  onRetryAfterFailure?: () => void;
}) {
  const { safeT } = useI18n();
  const isSplit = useIsMessengerSplitViewport();
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

  /**
   * 분할 화면(768px+) — 칸 전체를 덮는 대기 화면 대신, 불러오는 동안과 같은 틀(상단바 + 대화 배경) 안의
   * 대화 영역에만 대기·실패 표시 (설계 P2, 2026-11-07). 휴대폰은 아래 기존 화면 그대로.
   */
  if (isSplit) {
    const failed = Boolean(onRetryAfterFailure);
    return (
      <MessengerSplitRoomEntryFrame
        roomId={resolvedRoomId}
        dataAttrs={{
          "data-cm-room-entry-empty": "",
          ...(failed ? { "data-cm-room-entry-failed": "" } : { "data-cm-room-entry-buffering": "" }),
          ...dataAttrs,
        }}
        ariaProps={
          failed
            ? { role: "alert" }
            : { role: "status", "aria-live": "polite", "aria-busy": true, "aria-label": enteringLabel }
        }
      >
        {failed ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="sam-text-body text-[color:var(--cm-room-text-muted)]">
              {safeT("cm_ui_timeline_load_failed", {
                fallbackKo: "대화 내용을 불러오지 못했습니다.",
                fallbackEn: "Could not load this conversation.",
              })}
            </p>
            <button
              type="button"
              onClick={onRetryAfterFailure}
              className="rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-4 py-2 sam-text-helper font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
            >
              {safeT("cm_ui_timeline_retry", { fallbackKo: "다시 불러오기", fallbackEn: "Try again" })}
            </button>
          </div>
        ) : (
          <div
            data-cm-room-split-entry-wait=""
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
          >
            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--cm-room-primary)]" aria-hidden />
            <p className="sam-text-body text-[color:var(--cm-room-text-muted)]">{enteringLabel}</p>
          </div>
        )}
      </MessengerSplitRoomEntryFrame>
    );
  }

  if (onRetryAfterFailure) {
    return (
      <div
        data-messenger-shell
        data-cm-room
        data-cm-room-entry-empty=""
        data-cm-room-entry-failed=""
        {...dataAttrs}
        className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)]"
        role="alert"
      >
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[color:var(--cm-room-chat-bg)] px-6 text-center">
          <p className="sam-text-body text-[color:var(--cm-room-text-muted)]">
            {safeT("cm_ui_timeline_load_failed", {
              fallbackKo: "대화 내용을 불러오지 못했습니다.",
              fallbackEn: "Could not load this conversation.",
            })}
          </p>
          <button
            type="button"
            onClick={onRetryAfterFailure}
            className="rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-4 py-2 sam-text-helper font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
          >
            {safeT("cm_ui_timeline_retry", { fallbackKo: "다시 불러오기", fallbackEn: "Try again" })}
          </button>
        </div>
      </div>
    );
  }

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
