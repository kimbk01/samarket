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
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  type CommunityMessengerMessage,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { recordCmRoomEntryMilestone } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import {
  cmScrollAnalysisEnabled,
  logCmScrollAnalysis,
} from "@/lib/community-messenger/monitoring/cm-scroll-analysis";
import { logChatRoomScroll } from "@/lib/community-messenger/room/messenger-room-timeline-log";
import { applyRoomMessagesMutation } from "@/lib/community-messenger/room/messenger-room-messages-mutation";

type PrependVirtualizerLike = {
  scrollOffset?: number;
  scrollToOffset?: (offset: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void;
};

export type UseMessengerRoomLoadOlderMessagesFetchArgs = {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  roomMessagesRef: MutableRefObject<Array<CommunityMessengerMessage & { pending?: boolean }>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  messagesViewportRef: MutableRefObject<HTMLDivElement | null>;
  chatVirtualizerRef: MutableRefObject<PrependVirtualizerLike | null>;
  olderMessagesExhaustedRef: MutableRefObject<boolean>;
  loadOlderMessagesRef: MutableRefObject<() => void>;
  hasMoreOlderMessages: boolean;
  hasMoreOlderMessagesRef: MutableRefObject<boolean>;
  setHasMoreOlderMessages: Dispatch<SetStateAction<boolean>>;
  loadingOlderMessages: boolean;
  setLoadingOlderMessages: Dispatch<SetStateAction<boolean>>;
};

function oldestPersistedMessageId(
  messages: Array<CommunityMessengerMessage & { pending?: boolean }>
): string | null {
  for (const m of messages) {
    if (m.pending) continue;
    const rid = String(m.id ?? "").trim();
    if (!rid || rid.startsWith("pending:") || !isUuidLikeString(rid)) continue;
    return rid;
  }
  return null;
}

/**
 * 이전 메시지 페이지 fetch·병합·스크롤 높이 보정·paging 상태.
 * 센티넬(IntersectionObserver)은 `useMessengerRoomLoadOlderMessagesIntersection` 에 분리.
 */
export function useMessengerRoomLoadOlderMessagesFetch({
  roomId,
  snapshot,
  snapshotRef,
  roomMessages,
  roomMessagesRef,
  setRoomMessages,
  messagesViewportRef,
  chatVirtualizerRef,
  olderMessagesExhaustedRef,
  loadOlderMessagesRef,
  hasMoreOlderMessages,
  hasMoreOlderMessagesRef,
  setHasMoreOlderMessages,
  loadingOlderMessages,
  setLoadingOlderMessages,
}: UseMessengerRoomLoadOlderMessagesFetchArgs): {
  oldestLoadedMessageId: string | null;
  loadOlderMessages: () => Promise<void>;
  hydrateFullOlderMessageHistory: () => Promise<boolean>;
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
            : snapshot.messages.length >= COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT;
      setHasMoreOlderMessages(next);
    }
  }, [roomId, snapshot]);

  const oldestLoadedMessageId = useMemo(
    () => oldestPersistedMessageId(roomMessages),
    [roomMessages]
  );

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasMoreOlderMessagesRef.current || olderMessagesExhaustedRef.current) return;
    const beforeId = oldestPersistedMessageId(roomMessagesRef.current);
    if (!beforeId) return;
    if (inFlightPromiseRef.current && inFlightBeforeIdRef.current === beforeId) {
      return inFlightPromiseRef.current;
    }
    const apiRoomId = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!apiRoomId) return;
    const run = async () => {
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
        const t0 = performance.now();
        applyRoomMessagesMutation(setRoomMessages, "prepend", (prev) =>
          mergeRoomMessages(prev, json.messages ?? [])
        );
        if (!json.hasMore) {
          olderMessagesExhaustedRef.current = true;
        }
        setHasMoreOlderMessages(Boolean(json.hasMore));
        if (cmScrollAnalysisEnabled()) {
          logCmScrollAnalysis({
            prepend_scroll_restore_ms: Math.round((performance.now() - t0) * 1000) / 1000,
            auto_scroll_triggered: false,
            auto_scroll_reason: "prepend_history_anchor",
            room_id_suffix: apiRoomId.length > 8 ? apiRoomId.slice(-8) : apiRoomId,
          });
        }
        logChatRoomScroll("prepend_older_preserve_position", {
          roomIdSuffix: apiRoomId.length > 8 ? apiRoomId.slice(-8) : apiRoomId,
        });
      } finally {
        setLoadingOlderMessages(false);
      }
    };
    inFlightBeforeIdRef.current = beforeId;
    const inFlightPromise = run().finally(() => {
      if (inFlightPromiseRef.current === inFlightPromise) {
        inFlightPromiseRef.current = null;
        inFlightBeforeIdRef.current = null;
      }
    });
    inFlightPromiseRef.current = inFlightPromise;
    return inFlightPromise;
  }, [roomId, loadingOlderMessages]);

  const hydrateFullOlderMessageHistory = useCallback(async (): Promise<boolean> => {
    if (olderMessagesExhaustedRef.current || !hasMoreOlderMessagesRef.current) return false;
    let loadedAny = false;
    let pages = 0;
    const maxPages = 48;
    while (pages < maxPages && !olderMessagesExhaustedRef.current && hasMoreOlderMessagesRef.current) {
      const beforeId = oldestPersistedMessageId(roomMessagesRef.current);
      if (!beforeId) break;
      const prevCount = roomMessagesRef.current.length;
      const inFlight = inFlightPromiseRef.current;
      if (inFlight) {
        await inFlight;
      } else {
        await loadOlderMessages();
      }
      pages += 1;
      if (roomMessagesRef.current.length > prevCount) loadedAny = true;
      if (roomMessagesRef.current.length <= prevCount && olderMessagesExhaustedRef.current) break;
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
    return loadedAny;
  }, [loadOlderMessages]);

  loadOlderMessagesRef.current = () => {
    void loadOlderMessages();
  };

  return { oldestLoadedMessageId, loadOlderMessages, hydrateFullOlderMessageHistory };
}
