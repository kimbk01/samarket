"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT,
  type CommunityMessengerMessage,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { recordCmRoomEntryMilestone } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import {
  cmScrollAnalysisEnabled,
  logCmScrollAnalysis,
} from "@/lib/community-messenger/monitoring/cm-scroll-analysis";

export type UseMessengerRoomLoadOlderMessagesFetchArgs = {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  messagesViewportRef: MutableRefObject<HTMLDivElement | null>;
  olderMessagesExhaustedRef: MutableRefObject<boolean>;
  loadOlderMessagesRef: MutableRefObject<() => void>;
  hasMoreOlderMessages: boolean;
  setHasMoreOlderMessages: Dispatch<SetStateAction<boolean>>;
  loadingOlderMessages: boolean;
  setLoadingOlderMessages: Dispatch<SetStateAction<boolean>>;
};

/**
 * 이전 메시지 페이지 fetch·병합·스크롤 높이 보정·paging 상태.
 * 센티넬(IntersectionObserver)은 `useMessengerRoomLoadOlderMessagesIntersection` 에 분리.
 */
export function useMessengerRoomLoadOlderMessagesFetch({
  roomId,
  snapshot,
  snapshotRef,
  roomMessages,
  setRoomMessages,
  messagesViewportRef,
  olderMessagesExhaustedRef,
  loadOlderMessagesRef,
  hasMoreOlderMessages,
  setHasMoreOlderMessages,
  loadingOlderMessages,
  setLoadingOlderMessages,
}: UseMessengerRoomLoadOlderMessagesFetchArgs): {
  oldestLoadedMessageId: string | null;
  loadOlderMessages: () => Promise<void>;
} {
  const inFlightBeforeIdRef = useRef<string | null>(null);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const deferredHistoryMilestoneRecordedRef = useRef(false);

  useEffect(() => {
    olderMessagesExhaustedRef.current = false;
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
    inFlightBeforeIdRef.current = null;
    inFlightPromiseRef.current = null;
    deferredHistoryMilestoneRecordedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!snapshot) return;
    if (String(snapshot.room.id) !== String(roomId)) return;
    if (!olderMessagesExhaustedRef.current) {
      const serverFlag = snapshot.hasMoreOlderMessages;
      const lim = snapshot.bootstrapInitialMessageLimit;
      const next =
        typeof serverFlag === "boolean"
          ? serverFlag
          : typeof lim === "number" && lim > 0
            ? snapshot.messages.length >= lim
            : snapshot.messages.length >= COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT;
      setHasMoreOlderMessages(next);
    }
  }, [roomId, snapshot]);

  const oldestLoadedMessageId = useMemo(() => {
    for (const m of roomMessages) {
      if (m.pending) continue;
      const rid = String(m.id ?? "").trim();
      if (!rid || rid.startsWith("pending:") || !isUuidLikeString(rid)) continue;
      return rid;
    }
    return null;
  }, [roomMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasMoreOlderMessages || olderMessagesExhaustedRef.current) return;
    const beforeId = oldestLoadedMessageId;
    if (!beforeId) return;
    if (inFlightPromiseRef.current && inFlightBeforeIdRef.current === beforeId) {
      return inFlightPromiseRef.current;
    }
    const apiRoomId = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!apiRoomId) return;
    const run = async () => {
      const vp = messagesViewportRef.current;
      const prevScrollHeight = vp?.scrollHeight ?? 0;
      const prevScrollTop = vp?.scrollTop ?? 0;
      setLoadingOlderMessages(true);
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(apiRoomId)}/messages?before=${encodeURIComponent(beforeId)}`,
          { cache: "no-store", credentials: "include" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: CommunityMessengerMessage[];
          hasMore?: boolean;
        };
        if (!res.ok || !json.ok || !Array.isArray(json.messages)) {
          olderMessagesExhaustedRef.current = true;
          setHasMoreOlderMessages(false);
          return;
        }
        if (json.messages.length === 0) {
          olderMessagesExhaustedRef.current = true;
          setHasMoreOlderMessages(false);
          return;
        }
        if (!deferredHistoryMilestoneRecordedRef.current) {
          deferredHistoryMilestoneRecordedRef.current = true;
          recordCmRoomEntryMilestone("deferred_history_ms");
        }
        setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
        if (!json.hasMore) {
          olderMessagesExhaustedRef.current = true;
        }
        setHasMoreOlderMessages(Boolean(json.hasMore));
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const el = messagesViewportRef.current;
            if (!el || prevScrollHeight <= 0) return;
            const t0 = performance.now();
            const heightDelta = el.scrollHeight - prevScrollHeight;
            const expectedTop = prevScrollTop + heightDelta;
            el.scrollTop += heightDelta;
            const restoreMs = performance.now() - t0;
            const anchorErrPx = Math.round(Math.abs(el.scrollTop - expectedTop));
            if (cmScrollAnalysisEnabled()) {
              logCmScrollAnalysis({
                prepend_scroll_restore_ms: Math.round(restoreMs * 1000) / 1000,
                visible_window_jump_px: anchorErrPx,
                auto_scroll_triggered: false,
                auto_scroll_reason: "prepend_history_anchor",
                room_id_suffix: apiRoomId.length > 8 ? apiRoomId.slice(-8) : apiRoomId,
              });
            }
          });
        });
      } finally {
        setLoadingOlderMessages(false);
      }
    };
    inFlightBeforeIdRef.current = beforeId;
    let inFlightPromise: Promise<void>;
    inFlightPromise = run().finally(() => {
      if (inFlightPromiseRef.current === inFlightPromise) {
        inFlightPromiseRef.current = null;
        inFlightBeforeIdRef.current = null;
      }
    });
    inFlightPromiseRef.current = inFlightPromise;
    return inFlightPromise;
  }, [roomId, oldestLoadedMessageId, loadingOlderMessages, hasMoreOlderMessages]);

  loadOlderMessagesRef.current = () => {
    void loadOlderMessages();
  };

  return { oldestLoadedMessageId, loadOlderMessages };
}
