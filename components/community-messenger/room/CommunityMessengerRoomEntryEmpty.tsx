"use client";

import { memo, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
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
 * Cold/first-entry wait — 방 틀(상단바 + 대화 배경 · 앱 진입 SSOT C2). 실패 상태만 문구·다시 시도.
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
  const enteringLabel = safeT("cm_ui_entering");

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
   * 분할 화면(768px+) — 불러오는 동안과 같은 틀(상단바 + 대화 배경). 실패만 대화 영역에 문구·다시 시도 (설계 P2, 2026-11-07).
   * 대기 중 문구·스피너는 없다(앱 진입 SSOT C2, 2026-11-26 — 휴대폰과 같음).
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
              {safeT("cm_ui_timeline_load_failed")}
            </p>
            <button
              type="button"
              onClick={onRetryAfterFailure}
              className="rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-4 py-2 sam-text-helper font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
            >
              {safeT("cm_ui_timeline_retry")}
            </button>
          </div>
        ) : (
          <div data-cm-room-split-entry-wait="" className="min-h-0 flex-1" aria-hidden />
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
            {safeT("cm_ui_timeline_load_failed")}
          </p>
          <button
            type="button"
            onClick={onRetryAfterFailure}
            className="rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-4 py-2 sam-text-helper font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
          >
            {safeT("cm_ui_timeline_retry")}
          </button>
        </div>
      </div>
    );
  }

  /**
   * 앱 진입 SSOT C2 (`docs/audit/app-entry-ssot-fix-design-2026-11-26.md` §11 · Owner 「C1′로 진행」 2026-11-26):
   * 방 데이터를 기다리는 동안 「채팅방 입장 중…」 문구·스피너 대신 방과 같은 틀(상단바 + 대화 배경)만 그린다 —
   * 분할 화면과 같은 틀. 알림·복원 진입에서 OS 화면이 경로 도착 첫 프레임에 걷혀도 대기 화면이 보이지 않는다.
   * 읽기 도구용 「입장 중」 상태(aria-busy·라벨)는 그대로.
   */
  return (
    <MessengerSplitRoomEntryFrame
      roomId={resolvedRoomId}
      dataAttrs={{ "data-cm-room-entry-empty": "", "data-cm-room-entry-buffering": "", ...dataAttrs }}
      ariaProps={{ role: "status", "aria-live": "polite", "aria-busy": true, "aria-label": enteringLabel }}
    >
      <div className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]" aria-hidden />
    </MessengerSplitRoomEntryFrame>
  );
});
