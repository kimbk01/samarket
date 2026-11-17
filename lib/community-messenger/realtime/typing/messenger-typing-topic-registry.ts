"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import {
  MESSENGER_TYPING_PRUNE_MS,
  MESSENGER_TYPING_TTL_MS,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-timing";

/**
 * 입력 중 **수신** 토픽 `community-messenger-typing:<roomId>` 공유 등록부 (P3, 2026-11-18).
 *
 * - realtime-js `sb.channel(topic)` 은 같은 토픽이면 **같은 채널 인스턴스를 돌려준다**(RealtimeClient.channel).
 *   방 화면과 대화 목록 행(분할 화면에서 동시에 열림)이 같은 토픽을 따로 열고 닫으면 한쪽 `removeChannel` 이
 *   다른 쪽 구독을 끊는다 → 토픽당 채널 1개 + 참조 수.
 * - 참조 0 → `removeChannel` 을 **기다린 뒤에만** 같은 토픽을 다시 만든다(떠나는 채널 재사용 금지).
 * - 새 토픽·DB 없음. 발신은 REST(`sendMessengerPrivateBroadcastFromClient`) 그대로 — 여기서 채널을 만들지 않는다.
 */
export function communityMessengerTypingChannelName(roomId: string): string {
  return `community-messenger-typing:${String(roomId ?? "").trim().toLowerCase()}`;
}

type TopicEntry = {
  roomId: string;
  viewerUserId: string;
  refCount: number;
  channel: RealtimeChannel | null;
  sb: SupabaseClient;
};

const entries = new Map<string, TopicEntry>();
/** removeChannel 진행 중인 토픽 → 끝나면 resolve */
const leaving = new Map<string, Promise<void>>();
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function ensurePruneTimer(): void {
  if (pruneTimer != null || typeof window === "undefined") return;
  pruneTimer = setInterval(() => {
    useMessengerTypingStore.getState().clearExpired();
  }, MESSENGER_TYPING_PRUNE_MS);
}

function stopPruneTimerIfIdle(): void {
  if (entries.size > 0 || pruneTimer == null) return;
  clearInterval(pruneTimer);
  pruneTimer = null;
}

function readFromUserId(msg: unknown): string {
  const payload = (msg as { payload?: Record<string, unknown> } | null)?.payload ?? {};
  return typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
}

function openChannel(topic: string, entry: TopicEntry): void {
  /** 기다리는 사이 모두 해제됐거나 다른 항목으로 바뀌었으면 만들지 않는다 */
  if (entries.get(topic) !== entry || entry.refCount <= 0 || entry.channel) return;
  const { sb, roomId, viewerUserId } = entry;
  primeMessengerPrivateRealtimeAuth(sb);
  const store = useMessengerTypingStore;
  entry.channel = sb
    .channel(topic, messengerPrivateBroadcastChannelOptions())
    .on("broadcast", { event: "typing:start" }, (msg) => {
      const fromUserId = readFromUserId(msg);
      if (!fromUserId || fromUserId === viewerUserId) return;
      store.getState().setTyping(roomId, fromUserId, MESSENGER_TYPING_TTL_MS);
    })
    .on("broadcast", { event: "typing:stop" }, (msg) => {
      const fromUserId = readFromUserId(msg);
      if (!fromUserId || fromUserId === viewerUserId) return;
      store.getState().clearTyping(roomId, fromUserId);
    })
    .subscribe(createMessengerPrivateChannelStatusHandler({ sb, scope: "typing" }));
}

/**
 * 토픽 수신 참조 1개 획득. 반환 함수 = 해제(여러 번 불러도 1회만 적용).
 */
export function acquireMessengerTypingTopic(args: {
  sb: SupabaseClient;
  roomId: string;
  viewerUserId: string;
}): () => void {
  const roomId = String(args.roomId ?? "").trim().toLowerCase();
  const viewerUserId = String(args.viewerUserId ?? "").trim();
  if (!roomId || !viewerUserId) return () => {};
  const topic = communityMessengerTypingChannelName(roomId);
  let entry = entries.get(topic);
  if (entry) {
    entry.refCount += 1;
  } else {
    const created: TopicEntry = { roomId, viewerUserId, refCount: 1, channel: null, sb: args.sb };
    entries.set(topic, created);
    entry = created;
    ensurePruneTimer();
    const pending = leaving.get(topic);
    if (pending) {
      void pending.then(() => openChannel(topic, created));
    } else {
      openChannel(topic, created);
    }
  }
  const owned = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseEntry(topic, owned);
  };
}

function releaseEntry(topic: string, entry: TopicEntry): void {
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entries.get(topic) === entry) entries.delete(topic);
  /** 이 방을 보는 화면이 하나도 없으면 남은 입력 중 표시를 지운다(지난 동작 유지) */
  const bucket = useMessengerTypingStore.getState().byRoomId[entry.roomId];
  if (bucket) {
    for (const uid of Object.keys(bucket)) useMessengerTypingStore.getState().clearTyping(entry.roomId, uid);
  }
  stopPruneTimerIfIdle();
  const channel = entry.channel;
  entry.channel = null;
  if (!channel) return;
  const prior = leaving.get(topic) ?? Promise.resolve();
  const done: Promise<void> = prior
    .then(() => entry.sb.removeChannel(channel))
    .then(
      () => undefined,
      () => undefined
    )
    .then(() => {
      if (leaving.get(topic) === done) leaving.delete(topic);
    });
  leaving.set(topic, done);
}

/** 테스트 전용 — 등록부 상태 */
export function __messengerTypingTopicRegistryStateForTests(): {
  topics: { topic: string; refCount: number; open: boolean }[];
  leaving: string[];
} {
  return {
    topics: [...entries.entries()].map(([topic, e]) => ({ topic, refCount: e.refCount, open: Boolean(e.channel) })),
    leaving: [...leaving.keys()],
  };
}
