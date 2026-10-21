"use client";

/**
 * P-4: 입력창 전용 Phase1 컨텍스트.
 * 전체 phase1 값은 매 렌더 새 객체라 입력창이 메시지 수신·스크롤 때마다 다시 렌더됐다.
 * 입력창이 쓰는 값만 useMemo 로 묶어, 이 값들이 바뀔 때만 구독자가 다시 렌더된다.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MessengerRoomClientPhase1Value } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";

export type MessengerRoomComposerPhase1Value = Pick<
  MessengerRoomClientPhase1Value,
  | "notifyComposerTextareaVisibleForSeededBootstrap"
  | "replyToMessage"
  | "setReplyToMessage"
  | "editingMessage"
  | "setEditingMessage"
  | "setMessage"
  | "focusTimelineMessage"
>;

const MessengerRoomComposerPhase1Context = createContext<MessengerRoomComposerPhase1Value | null>(null);

export function useMessengerRoomComposerPhase1Value(
  phase1: MessengerRoomComposerPhase1Value
): MessengerRoomComposerPhase1Value {
  const {
    notifyComposerTextareaVisibleForSeededBootstrap,
    replyToMessage,
    setReplyToMessage,
    editingMessage,
    setEditingMessage,
    setMessage,
    focusTimelineMessage,
  } = phase1;
  return useMemo(
    () => ({
      notifyComposerTextareaVisibleForSeededBootstrap,
      replyToMessage,
      setReplyToMessage,
      editingMessage,
      setEditingMessage,
      setMessage,
      focusTimelineMessage,
    }),
    [
      notifyComposerTextareaVisibleForSeededBootstrap,
      replyToMessage,
      setReplyToMessage,
      editingMessage,
      setEditingMessage,
      setMessage,
      focusTimelineMessage,
    ]
  );
}

export function MessengerRoomComposerPhase1Provider({
  phase1,
  children,
}: {
  phase1: MessengerRoomComposerPhase1Value;
  children: ReactNode;
}) {
  const value = useMessengerRoomComposerPhase1Value(phase1);
  return (
    <MessengerRoomComposerPhase1Context.Provider value={value}>{children}</MessengerRoomComposerPhase1Context.Provider>
  );
}

export function useMessengerRoomComposerPhase1Context(): MessengerRoomComposerPhase1Value {
  const v = useContext(MessengerRoomComposerPhase1Context);
  if (!v) {
    throw new Error("useMessengerRoomComposerPhase1Context: Provider missing");
  }
  return v;
}
