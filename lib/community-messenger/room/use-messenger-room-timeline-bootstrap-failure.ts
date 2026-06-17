"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { logChatRoomTimelineRetry } from "@/lib/community-messenger/room/messenger-room-timeline-log";
import { hasMessengerRoomTimelineLoadHint } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

export type TimelineBootstrapOutcomePayload = {
  ok: boolean;
  httpStatus: number;
  shouldBlock: boolean;
  silent: boolean;
  triggerReason?: string;
  snapshotMessageCount: number;
};

function hasPaintableTimelineMessages(roomMessages: Array<{ pending?: boolean }>): boolean {
  return roomMessages.some((m) => !m.pending);
}

/** @internal 테스트용 */
export function shouldMarkTimelineLoadFailed(input: {
  payload: TimelineBootstrapOutcomePayload;
  hasPaint: boolean;
  hasHint: boolean;
}): boolean {
  const { payload, hasPaint, hasHint } = input;
  if (!hasHint || hasPaint) return false;

  if (payload.triggerReason === "timeline_bootstrap_retry") {
    return !payload.ok || payload.snapshotMessageCount === 0;
  }

  if (payload.shouldBlock && !payload.silent) {
    return !payload.ok;
  }

  return false;
}

export function useMessengerRoomTimelineBootstrapFailure({
  roomId,
  roomMessagesRef,
  snapshotRef,
  refresh,
  setLoading,
}: {
  roomId: string;
  roomMessagesRef: MutableRefObject<Array<{ pending?: boolean }>>;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  refresh: (
    silent?: boolean,
    opts?: { forceForegroundBlock?: boolean; triggerReason?: string }
  ) => Promise<void>;
  setLoading: (loading: boolean) => void;
}): {
  timelineLoadFailed: boolean;
  reportTimelineBootstrapOutcome: (payload: TimelineBootstrapOutcomePayload) => void;
  retryTimelineLoad: () => void;
} {
  const [timelineLoadFailed, setTimelineLoadFailed] = useState(false);
  const retryInFlightRef = useRef(false);

  useEffect(() => {
    setTimelineLoadFailed(false);
    retryInFlightRef.current = false;
  }, [roomId]);

  const reportTimelineBootstrapOutcome = useCallback(
    (payload: TimelineBootstrapOutcomePayload) => {
      const snap = snapshotRef.current;
      const hasPaint = hasPaintableTimelineMessages(roomMessagesRef.current);
      const hasHint = hasMessengerRoomTimelineLoadHint({
        roomMessagesLength: roomMessagesRef.current.length,
        snapshotMessagesLength: snap?.messages?.length ?? 0,
        lastMessage: snap?.room.lastMessage,
      });
      const rid = roomId.trim();

      if (payload.triggerReason === "timeline_bootstrap_retry") {
        if (shouldMarkTimelineLoadFailed({ payload, hasPaint, hasHint })) {
          setTimelineLoadFailed(true);
          logChatRoomTimelineRetry("error", {
            roomId: rid,
            httpStatus: payload.httpStatus,
            reason: "empty_after_retry",
          });
        } else {
          setTimelineLoadFailed(false);
          logChatRoomTimelineRetry("done", {
            roomId: rid,
            messageCount: payload.snapshotMessageCount,
            httpStatus: payload.httpStatus,
          });
        }
        retryInFlightRef.current = false;
        return;
      }

      if (payload.shouldBlock && !payload.silent) {
        if (shouldMarkTimelineLoadFailed({ payload, hasPaint, hasHint })) {
          setTimelineLoadFailed(true);
        } else if (hasPaint || payload.snapshotMessageCount > 0 || !hasHint) {
          setTimelineLoadFailed(false);
        }
      }
    },
    [roomId, roomMessagesRef, snapshotRef]
  );

  const retryTimelineLoad = useCallback(() => {
    const rid = roomId.trim();
    if (!rid || retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    setTimelineLoadFailed(false);
    logChatRoomTimelineRetry("start", { roomId: rid });
    setLoading(true);
    void refresh(false, {
      forceForegroundBlock: true,
      triggerReason: "timeline_bootstrap_retry",
    })
      .catch((err: unknown) => {
        setTimelineLoadFailed(true);
        retryInFlightRef.current = false;
        logChatRoomTimelineRetry("error", {
          roomId: rid,
          reason: err instanceof Error ? err.message : "refresh_exception",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [roomId, refresh, setLoading]);

  return {
    timelineLoadFailed,
    reportTimelineBootstrapOutcome,
    retryTimelineLoad,
  };
}
