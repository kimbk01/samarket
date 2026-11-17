"use client";

import { useEffect, useRef, type RefObject } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { sendMessengerPrivateBroadcastFromClient } from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  acquireMessengerTypingTopic,
  communityMessengerTypingChannelName,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-topic-registry";
import {
  MESSENGER_TYPING_IDLE_MS,
  MESSENGER_TYPING_RESEND_MS,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-timing";

/**
 * 타이핑 — 방 단위 **비공개** 토픽 `community-messenger-typing:<roomId>`.
 * 수신: private 채널 join(SELECT 정책 = 방 접근 가능자) — 토픽 공유 등록부(`messenger-typing-topic-registry`)로
 * 방 화면·대화 목록 행이 같은 채널 1개를 함께 쓴다. 발신: REST broadcast + 사용자 JWT(INSERT 정책).
 */
export { communityMessengerTypingChannelName };

export function useCommunityMessengerRoomTypingRuntime(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  /**
   * 1:1 상대 id(호환용 — 지금은 쓰지 않음). 토픽 발신 권한이 방 참가자로 제한되므로 1:1 방에서 본인 외 발신자는
   * 상대뿐이고, 표시 쪽(머리글)이 상대 id 로만 읽는다.
   */
  peerUserId?: string | null | undefined;
}): void {
  useEffect(() => {
    const roomId = typeof args.roomId === "string" ? args.roomId.trim().toLowerCase() : "";
    const viewerUserId = typeof args.viewerUserId === "string" ? args.viewerUserId.trim() : "";
    if (!roomId || !viewerUserId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    return acquireMessengerTypingTopic({ sb, roomId, viewerUserId });
  }, [args.roomId, args.viewerUserId]);
}

type TypingEventName = "typing:start" | "typing:stop";

function sendTypingSignal(roomId: string, viewerUserId: string, event: TypingEventName): void {
  if (!roomId || !viewerUserId) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  void sendMessengerPrivateBroadcastFromClient({
    sb,
    topic: communityMessengerTypingChannelName(roomId),
    event,
    payload: { roomId, fromUserId: viewerUserId, at: new Date().toISOString() },
    scope: "typing",
    timeoutMs: 3_000,
  });
}

/** 발신 조건 — 화면 보임 + 이 입력창에 포커스 (레거시: 입력창에서 글자가 바뀔 때만) */
export function messengerTypingCanSignal(input: HTMLElement | null | undefined): boolean {
  if (typeof document === "undefined" || !input) return false;
  if (document.visibilityState !== "visible") return false;
  return document.activeElement === input;
}

type TypingPublisherState = {
  /** start 를 보낸 방·사용자 — stop 은 반드시 같은 대상으로 */
  active: { roomId: string; viewerUserId: string } | null;
  lastSentAt: number;
  stopTimer: number | null;
};

function stopTypingPublisher(st: TypingPublisherState): void {
  if (st.stopTimer != null) {
    window.clearTimeout(st.stopTimer);
    st.stopTimer = null;
  }
  const active = st.active;
  st.active = null;
  st.lastSentAt = 0;
  if (active) sendTypingSignal(active.roomId, active.viewerUserId, "typing:stop");
}

/**
 * 입력 중 발신 (P3 · 레거시 Telegram 기준).
 * - 초안이 바뀔 때(키 입력 구동)만: 보임 + 포커스 + 초안 있음 → 처음이거나 마지막 발신 5초 경과면 `typing:start`.
 * - 2.6초 무입력 · 초안 비움(전송 포함) · 입력창 blur · 화면 숨김 · pagehide · 방 나감 → `typing:stop` 1회.
 * - 저장 초안 복원만으로는 보내지 않는다(포커스 없음).
 */
export function useCommunityMessengerRoomTypingPublisher(args: {
  roomId: string | null | undefined;
  viewerUserId: string | null | undefined;
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}): void {
  const stateRef = useRef<TypingPublisherState>({ active: null, lastSentAt: 0, stopTimer: null });
  const { roomId: roomIdRaw, viewerUserId: viewerUserIdRaw, draft, inputRef } = args;

  const roomId = typeof roomIdRaw === "string" ? roomIdRaw.trim().toLowerCase() : "";
  const viewerUserId = typeof viewerUserIdRaw === "string" ? viewerUserIdRaw.trim() : "";

  useEffect(() => {
    if (!roomId || !viewerUserId) return;
    const hasDraft = draft.trim().length > 0;
    const st = stateRef.current;
    if (!hasDraft || !messengerTypingCanSignal(inputRef.current)) {
      stopTypingPublisher(st);
      return;
    }
    const now = Date.now();
    const active = st.active;
    const sameTarget = Boolean(active && active.roomId === roomId && active.viewerUserId === viewerUserId);
    if (!sameTarget || now - st.lastSentAt >= MESSENGER_TYPING_RESEND_MS) {
      if (active && !sameTarget) stopTypingPublisher(st);
      st.active = { roomId, viewerUserId };
      st.lastSentAt = now;
      sendTypingSignal(roomId, viewerUserId, "typing:start");
    }
    if (st.stopTimer != null) window.clearTimeout(st.stopTimer);
    st.stopTimer = window.setTimeout(() => {
      st.stopTimer = null;
      stopTypingPublisher(st);
    }, MESSENGER_TYPING_IDLE_MS);
  }, [draft, inputRef, roomId, viewerUserId]);

  /** blur · 화면 숨김 · pagehide · 방 나감(언마운트/방 전환) → stop */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const st = stateRef.current;
    const onFocusOut = (ev: FocusEvent) => {
      if (ev.target === inputRef.current) stopTypingPublisher(st);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") stopTypingPublisher(st);
    };
    const onPageHide = () => stopTypingPublisher(st);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      stopTypingPublisher(st);
    };
  }, [inputRef, roomId, viewerUserId]);
}
