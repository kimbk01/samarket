"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export type UseMessengerRoomLoadOlderMessagesFetchArgs = {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  messagesViewportRef: MutableRefObject<HTMLDivElement | null>;
  CM_SNAPSHOT_FIRST_PAGE: number;
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
  CM_SNAPSHOT_FIRST_PAGE,
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
  useEffect(() => {
    olderMessagesExhaustedRef.current = false;
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
  }, [roomId]);

  useEffect(() => {
    if (!snapshot) return;
    if (String(snapshot.room.id) !== String(roomId)) return;
    if (!olderMessagesExhaustedRef.current) {
      setHasMoreOlderMessages(snapshot.messages.length >= CM_SNAPSHOT_FIRST_PAGE);
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
    const apiRoomId = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!apiRoomId) return;
    const vp = messagesViewportRef.current;
    const prevScrollHeight = vp?.scrollHeight ?? 0;
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
      setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
      if (!json.hasMore) {
        olderMessagesExhaustedRef.current = true;
      }
      setHasMoreOlderMessages(Boolean(json.hasMore));
      window.requestAnimationFrame(() => {
        const el = messagesViewportRef.current;
        if (el && prevScrollHeight > 0) {
          el.scrollTop += el.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [roomId, oldestLoadedMessageId, loadingOlderMessages, hasMoreOlderMessages]);

  loadOlderMessagesRef.current = () => {
    void loadOlderMessages();
  };

  return { oldestLoadedMessageId, loadOlderMessages };
}
