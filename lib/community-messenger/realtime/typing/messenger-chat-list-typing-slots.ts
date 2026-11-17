"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { acquireMessengerTypingTopic } from "@/lib/community-messenger/realtime/typing/messenger-typing-topic-registry";

/**
 * 대화 목록 행 「입력 중」 수신 슬롯 (P3 · Owner 2026-11-18 「목록 미리보기 자리에 입력 중」, 레거시 Telegram `DialogCell`).
 *
 * - 화면에 **보이는** 목록 행만 기존 토픽 `community-messenger-typing:<roomId>` 를 **수신 전용**으로 구독한다
 *   (새 DB·토픽 없음, 발신 없음). 동시에 최대 {@link MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS} 방.
 * - 상한을 넘는 행은 대기열에 두고, 앞 행이 화면에서 빠지면(슬롯 반납) 순서대로 받는다.
 * - 채널 실체는 토픽 등록부(`messenger-typing-topic-registry`)가 관리 — 방 화면과 같은 토픽이면 채널 1개 공유,
 *   해제는 `removeChannel` 완료를 기다린 뒤에만 같은 토픽을 다시 만든다.
 *
 * 채널 수 영향: 목록 화면에서 비공개 broadcast 채널 **최대 +15**(보이는 행 수 이하, 휴대폰 한 화면 약 8~10행).
 * 방에 들어가 있는 동안 목록이 언마운트되면 0, 분할 화면(목록+방)에서는 방 토픽과 겹치는 1개는 공유.
 */
export const MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS = 15;

type SlotRequest = {
  sb: SupabaseClient;
  roomId: string;
  viewerUserId: string;
  release: (() => void) | null;
};

const requests = new Map<symbol, SlotRequest>();
const active = new Set<symbol>();
const waiting: symbol[] = [];

function grant(token: symbol): void {
  const req = requests.get(token);
  if (!req) return;
  active.add(token);
  req.release = acquireMessengerTypingTopic({ sb: req.sb, roomId: req.roomId, viewerUserId: req.viewerUserId });
}

function pump(): void {
  while (active.size < MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS && waiting.length > 0) {
    const next = waiting.shift()!;
    if (requests.has(next)) grant(next);
  }
}

/** 보이는 행 1개의 수신 슬롯 요청. 반환 = 반납(여러 번 불러도 1회). */
export function requestMessengerChatListTypingSlot(args: {
  sb: SupabaseClient;
  roomId: string;
  viewerUserId: string;
}): () => void {
  const roomId = String(args.roomId ?? "").trim().toLowerCase();
  const viewerUserId = String(args.viewerUserId ?? "").trim();
  if (!roomId || !viewerUserId) return () => {};
  const token = Symbol(roomId);
  requests.set(token, { sb: args.sb, roomId, viewerUserId, release: null });
  if (active.size < MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS) grant(token);
  else waiting.push(token);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const req = requests.get(token);
    requests.delete(token);
    if (active.delete(token)) {
      req?.release?.();
      pump();
      return;
    }
    const i = waiting.indexOf(token);
    if (i >= 0) waiting.splice(i, 1);
  };
}

/** 테스트 전용 */
export function __messengerChatListTypingSlotStateForTests(): { active: number; waiting: number } {
  return { active: active.size, waiting: waiting.length };
}

/* ── 보이는 행 판정: 공유 IntersectionObserver 1개 ── */

type VisibilityListener = (visible: boolean) => void;
const visibilityListeners = new Map<Element, VisibilityListener>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (sharedObserver) return sharedObserver;
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  sharedObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visibilityListeners.get(entry.target)?.(entry.isIntersecting);
    }
  });
  return sharedObserver;
}

/** 목록 행 요소가 화면에 보이는지 구독 — IntersectionObserver 가 없으면 보이는 것으로 본다. */
export function observeMessengerChatListRowVisibility(el: Element, listener: VisibilityListener): () => void {
  const io = getSharedObserver();
  if (!io) {
    listener(true);
    return () => {};
  }
  visibilityListeners.set(el, listener);
  io.observe(el);
  return () => {
    visibilityListeners.delete(el);
    io.unobserve(el);
  };
}
