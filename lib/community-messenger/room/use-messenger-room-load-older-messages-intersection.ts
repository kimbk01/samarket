"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * 상단 센티넬 IntersectionObserver — `loadOlderMessagesRef` 트리거만 담당.
 * fetch·상태·`prevScrollHeight` 보정은 `useMessengerRoomLoadOlderMessagesFetch` 에 둔다.
 */
export function useMessengerRoomLoadOlderMessagesIntersection({
  roomId,
  hasMoreOlderMessages,
  oldestLoadedMessageId,
  messagesViewportRef,
  topOlderSentinelRef,
  olderMessagesExhaustedRef,
  loadOlderMessagesRef,
}: {
  roomId: string;
  hasMoreOlderMessages: boolean;
  oldestLoadedMessageId: string | null;
  messagesViewportRef: MutableRefObject<HTMLDivElement | null>;
  topOlderSentinelRef: MutableRefObject<HTMLDivElement | null>;
  olderMessagesExhaustedRef: MutableRefObject<boolean>;
  loadOlderMessagesRef: MutableRefObject<() => void>;
}): void {
  const lastTriggerAtRef = useRef(0);
  useEffect(() => {
    const root = messagesViewportRef.current;
    const target = topOlderSentinelRef.current;
    if (!root || !target || !hasMoreOlderMessages || olderMessagesExhaustedRef.current) return;
    lastTriggerAtRef.current = 0;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        const now = Date.now();
        if (now - lastTriggerAtRef.current < 240) return;
        lastTriggerAtRef.current = now;
        loadOlderMessagesRef.current();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [roomId, hasMoreOlderMessages, oldestLoadedMessageId]);
}
