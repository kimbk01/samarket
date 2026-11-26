"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import {
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import { superviseMessengerChannel } from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import type { SubscribeWithRetryHandle } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
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
  /** 감독 가입 핸들(결함 2, 2026-11-27) — 가입·재시도·차단은 감독이, 토픽 정리는 이 등록부가 한다 */
  channel: SubscribeWithRetryHandle | null;
  sb: SupabaseClient;
  /** 해제됐는지 — 감독 재시도 중단 */
  released: boolean;
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

/** realtime-js 가 보관하는 같은 토픽 채널(떠나는 중·leave 실패로 남은 것 포함) */
function staleChannelsForTopic(sb: SupabaseClient, topic: string): RealtimeChannel[] {
  const full = `realtime:${topic}`;
  try {
    return (sb.getChannels?.() ?? []).filter((c) => c.topic === full);
  } catch {
    return [];
  }
}

/**
 * 소켓 목록에서 채널을 확실히 뺀다 — `removeChannel` 은 leave 응답이 error/timeout 이어도 throw 하지 않고
 * 채널을 목록에 남긴다. 남으면 다음 `sb.channel(topic)` 이 떠난 인스턴스를 돌려주고 subscribe 가 throw → 영구 수신 불가.
 * (`_remove` 는 realtime-js 내부 함수 — 없으면 건너뜀)
 */
function dropFromSocket(sb: SupabaseClient, channel: RealtimeChannel): void {
  try {
    const rt = sb.realtime as unknown as { _remove?: (c: RealtimeChannel) => void };
    rt._remove?.(channel);
  } catch {
    /* ignore */
  }
}

async function forceRemoveChannel(sb: SupabaseClient, channel: RealtimeChannel | null | undefined): Promise<void> {
  if (!channel) return;
  /** 감독 핸들 stop 이 이미 닫은 채널에 다시 unsubscribe 하면 leave 가 한 번 더 나간다(독립 검토 6번) — 닫혔으면 소켓 목록만 정리 */
  if ((channel as { state?: string }).state !== "closed") {
    try {
      await sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
  }
  dropFromSocket(sb, channel);
}

async function forceRemoveTopic(sb: SupabaseClient, topic: string): Promise<void> {
  for (const c of staleChannelsForTopic(sb, topic)) await forceRemoveChannel(sb, c);
}

function stillWanted(topic: string, entry: TopicEntry): boolean {
  return entries.get(topic) === entry && entry.refCount > 0 && !entry.channel;
}

function openChannel(topic: string, entry: TopicEntry, attempt = 0): void {
  /** 기다리는 사이 모두 해제됐거나 다른 항목으로 바뀌었으면 만들지 않는다 */
  if (!stillWanted(topic, entry)) return;
  const { sb } = entry;
  /** 같은 토픽 잔존 채널이 있으면 먼저 확실히 제거한 뒤 연다(떠나는 인스턴스 재사용 금지) */
  if (staleChannelsForTopic(sb, topic).length > 0) {
    void forceRemoveTopic(sb, topic)
      .then(() => openChannel(topic, entry, attempt))
      .catch(() => undefined);
    return;
  }
  try {
    entry.channel = createSubscribedChannel(topic, entry);
  } catch {
    /** subscribe throw(이미 join 된 인스턴스 등) → 강제 제거 후 1회만 재시도 */
    entry.channel = null;
    if (attempt >= 1) return;
    void forceRemoveTopic(sb, topic)
      .then(() => openChannel(topic, entry, attempt + 1))
      .catch(() => undefined);
  }
}

/**
 * 결함 2(2026-11-27 iPhone 실기): 직접 `subscribe()` 는 가입 실패 때 라이브러리가 10초마다 끝없이 재가입했다.
 * 감독 입구로 가입 — 차단기·대기·오프라인 일시정지. 타이핑은 재연결 때 다시 읽을 것이 없어 R2 note 를 부르지 않는다.
 * 설계 docs/audit/supabase-request-surge-2026-11-18/rt-bundle-gen-skip-and-unsupervised-channels-design-2026-11-27.md §3
 */
function createSubscribedChannel(topic: string, entry: TopicEntry): SubscribeWithRetryHandle {
  const { sb, roomId, viewerUserId } = entry;
  primeMessengerPrivateRealtimeAuth(sb);
  const store = useMessengerTypingStore;
  return superviseMessengerChannel({
    sb,
    name: topic,
    logStreamRoomId: roomId,
    scope: "typing",
    channelOptions: messengerPrivateBroadcastChannelOptions(),
    isCancelled: () => entry.released || entries.get(topic) !== entry,
    build: (ch: RealtimeChannel) =>
      ch
        .on("broadcast", { event: "typing:start" }, (msg) => {
          const fromUserId = readFromUserId(msg);
          if (!fromUserId || fromUserId === viewerUserId) return;
          store.getState().setTyping(roomId, fromUserId, MESSENGER_TYPING_TTL_MS);
        })
        .on("broadcast", { event: "typing:stop" }, (msg) => {
          const fromUserId = readFromUserId(msg);
          if (!fromUserId || fromUserId === viewerUserId) return;
          store.getState().clearTyping(roomId, fromUserId);
        }),
  });
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
    const created: TopicEntry = { roomId, viewerUserId, refCount: 1, channel: null, sb: args.sb, released: false };
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
  entry.released = true;
  /** 이 방을 보는 화면이 하나도 없으면 남은 입력 중 표시를 지운다(지난 동작 유지) */
  const bucket = useMessengerTypingStore.getState().byRoomId[entry.roomId];
  if (bucket) {
    for (const uid of Object.keys(bucket)) useMessengerTypingStore.getState().clearTyping(entry.roomId, uid);
  }
  stopPruneTimerIfIdle();
  const handle = entry.channel;
  entry.channel = null;
  if (!handle) return;
  /** 감독 핸들 정지(재시도 중단·채널 제거 요청) */
  handle.stop();
  const prior = leaving.get(topic) ?? Promise.resolve();
  const done: Promise<void> = prior
    /** leave 응답이 error 여도 소켓 목록에서 확실히 뺀다 — 처음 채널 + 감독 재시도로 바뀐 같은 토픽 인스턴스 */
    .then(() => forceRemoveChannel(entry.sb, handle.channel))
    .then(() => forceRemoveTopic(entry.sb, topic))
    .catch(() => undefined)
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
