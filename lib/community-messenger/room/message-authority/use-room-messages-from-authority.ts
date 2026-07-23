"use client";

import { useCallback, useRef } from "react";
import { useSyncExternalStore } from "react";
import {
  getRoomMessagesArray,
  peekRoomMessageState,
  subscribeRoomMessageStore,
  type RoomTimelineMessage,
} from "@/lib/community-messenger/room/message-authority/room-message-store";

const EMPTY: RoomTimelineMessage[] = [];

/**
 * Subscribe to Message Authority Room Store for one room.
 * UI must not subscribe to bootstrap/realtime/catch-up writers directly.
 */
export function useRoomMessagesFromAuthority(roomId: string | null | undefined): RoomTimelineMessage[] {
  const rid = roomId?.trim() ?? "";
  const cacheRef = useRef<{ rid: string; generation: number; list: RoomTimelineMessage[] }>({
    rid: "",
    generation: -1,
    list: EMPTY,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!rid) return () => {};
      return subscribeRoomMessageStore((changedRoomId) => {
        if (changedRoomId === rid) onStoreChange();
      });
    },
    [rid]
  );

  const getSnapshot = useCallback(() => {
    if (!rid) return EMPTY;
    const state = peekRoomMessageState(rid);
    if (!state) {
      cacheRef.current = { rid, generation: -1, list: EMPTY };
      return EMPTY;
    }
    if (cacheRef.current.rid === rid && cacheRef.current.generation === state.generation) {
      return cacheRef.current.list;
    }
    const list = getRoomMessagesArray(rid);
    cacheRef.current = { rid, generation: state.generation, list };
    return list;
  }, [rid]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Keep a mutable ref in sync with authority list (legacy call sites). */
export function useRoomMessagesAuthorityRef(roomId: string | null | undefined): {
  roomMessages: RoomTimelineMessage[];
  roomMessagesRef: React.MutableRefObject<RoomTimelineMessage[]>;
} {
  const roomMessages = useRoomMessagesFromAuthority(roomId);
  const roomMessagesRef = useRef(roomMessages);
  roomMessagesRef.current = roomMessages;
  return { roomMessages, roomMessagesRef };
}
