"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { CmRtHs4SubscribeContext } from "@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis";
import { cmRtRegistryDevLog } from "@/lib/community-messenger/realtime/cm-rt-loop-guard";

export type SubscribeWithRetryArgs = {
  sb: SupabaseClient;
  name: string;
  logStreamRoomId?: string;
  scope: string;
  build: (ch: RealtimeChannel) => RealtimeChannel;
  isCancelled: () => boolean;
  onStatus?: (status: string) => void;
  onAfterSubscribeFailure?: (status: string, attempt: number) => void;
  silentAfterMs?: number;
  hs4Context?: CmRtHs4SubscribeContext;
  /**
   * Passed to `sb.channel(name, channelOptions)`.
   * Private broadcast topics must set `config.private: true` (Realtime Authorization RLS).
   */
  channelOptions?: {
    config: {
      private?: boolean;
      broadcast?: { ack?: boolean; self?: boolean };
    };
  };
};

export type SubscribeWithRetryHandle = {
  channel: RealtimeChannel;
  stop: () => void;
  markSignal: () => void;
};

type OwnerHandle = {
  token: symbol;
  isCancelled: () => boolean;
  onStatus?: (status: string) => void;
  onAfterSubscribeFailure?: (status: string, attempt: number) => void;
};

type RegistryEntry = {
  name: string;
  owners: Map<symbol, OwnerHandle>;
  sub: SubscribeWithRetryHandle;
  generation: number;
};

const registryByChannelName = new Map<string, RegistryEntry>();

export type CmRtInternalSubscribeFn = (args: SubscribeWithRetryArgs) => SubscribeWithRetryHandle;

function mergedIsCancelled(owners: Map<symbol, OwnerHandle>): () => boolean {
  return () => {
    for (const o of owners.values()) {
      if (o.isCancelled()) return true;
    }
    return false;
  };
}

function multicastStatus(owners: Map<symbol, OwnerHandle>, status: string): void {
  for (const o of owners.values()) {
    o.onStatus?.(status);
  }
}

function multicastAfterFailure(owners: Map<symbol, OwnerHandle>, status: string, attempt: number): void {
  for (const o of owners.values()) {
    o.onAfterSubscribeFailure?.(status, attempt);
  }
}

export function acquireCmRtChannelSubscription(
  args: SubscribeWithRetryArgs,
  createInternal: CmRtInternalSubscribeFn
): SubscribeWithRetryHandle {
  const name = args.name;
  const existing = registryByChannelName.get(name);
  if (existing && existing.owners.size > 0) {
    const token = Symbol("cm-rt-owner");
    existing.owners.set(token, {
      token,
      isCancelled: args.isCancelled,
      onStatus: args.onStatus,
      onAfterSubscribeFailure: args.onAfterSubscribeFailure,
    });
    cmRtRegistryDevLog("reuse", {
      key: name,
      generation: existing.generation,
      ownerCount: existing.owners.size,
      scope: args.scope,
    });
    return {
      channel: existing.sub.channel,
      markSignal: existing.sub.markSignal,
      stop: () => releaseCmRtChannelSubscription(name, token),
    };
  }

  const token = Symbol("cm-rt-owner");
  const owners = new Map<symbol, OwnerHandle>();
  owners.set(token, {
    token,
    isCancelled: args.isCancelled,
    onStatus: args.onStatus,
    onAfterSubscribeFailure: args.onAfterSubscribeFailure,
  });

  const sub = createInternal({
    ...args,
    isCancelled: mergedIsCancelled(owners),
    onStatus: (status) => multicastStatus(owners, status),
    onAfterSubscribeFailure: (status, attempt) => multicastAfterFailure(owners, status, attempt),
  });

  const entry: RegistryEntry = {
    name,
    owners,
    sub,
    generation: 1,
  };
  registryByChannelName.set(name, entry);
  cmRtRegistryDevLog("create", {
    key: name,
    generation: entry.generation,
    ownerCount: 1,
    scope: args.scope,
  });

  return {
    channel: sub.channel,
    markSignal: sub.markSignal,
    stop: () => releaseCmRtChannelSubscription(name, token),
  };
}

export function releaseCmRtChannelSubscription(channelName: string, token: symbol): void {
  const entry = registryByChannelName.get(channelName);
  if (!entry) return;
  entry.owners.delete(token);
  cmRtRegistryDevLog("remove", {
    key: channelName,
    generation: entry.generation,
    ownerCount: entry.owners.size,
  });
  if (entry.owners.size > 0) return;
  registryByChannelName.delete(channelName);
  entry.sub.stop();
}

/** dev/tests — active owner count per channel name */
export function cmRtRegistryOwnerCount(channelName: string): number {
  return registryByChannelName.get(channelName)?.owners.size ?? 0;
}

export function cmRtRegistryActiveChannelNames(): string[] {
  return [...registryByChannelName.keys()];
}

/**
 * M-5 — 같은 토픽 재구독은 **removeChannel 완료 후에만**.
 *
 * realtime-js 2.99.2 `RealtimeClient.channel(topic)` 은 같은 토픽 채널이 목록에 남아 있으면 **그 인스턴스를 반환**하고,
 * `removeChannel` 은 leave 응답 뒤에야 목록에서 뺀다(`_onClose → _remove`). remove 직후 같은 토픽을 다시 만들면
 * leaving 상태 채널을 돌려받아 `subscribe()` 가 무시되고, 곧 닫혀 **죽은 구독**이 남는다.
 * → 제거는 `removeCmRtChannelTracked` 로 하고, 생성은 `runAfterCmRtTopicRemoval` 로 그 완료를 기다린다.
 */
const pendingTopicRemovals = new Map<string, Promise<void>>();

function cmRtTopicKey(channelName: string): string {
  const n = String(channelName ?? "").trim();
  return n.startsWith("realtime:") ? n.slice("realtime:".length) : n;
}

export function removeCmRtChannelTracked(
  sb: Pick<SupabaseClient, "removeChannel">,
  channel: RealtimeChannel,
  channelName: string
): Promise<void> {
  const key = cmRtTopicKey(channelName);
  let removal: Promise<void>;
  try {
    removal = Promise.resolve(sb.removeChannel(channel)).then(
      () => undefined,
      () => undefined
    );
  } catch {
    removal = Promise.resolve();
  }
  const prev = pendingTopicRemovals.get(key);
  const combined = prev ? Promise.all([prev, removal]).then(() => undefined) : removal;
  pendingTopicRemovals.set(key, combined);
  void combined.then(() => {
    if (pendingTopicRemovals.get(key) === combined) pendingTopicRemovals.delete(key);
  });
  return combined;
}

/** 같은 토픽 제거가 진행 중이면 완료 후 `start`, 아니면 즉시(동기) 실행. */
export function runAfterCmRtTopicRemoval(channelName: string, start: () => void): void {
  const pending = pendingTopicRemovals.get(cmRtTopicKey(channelName));
  if (!pending) {
    start();
    return;
  }
  void pending.then(start);
}

/** tests — 진행 중 토픽 제거 여부 */
export function cmRtTopicRemovalPending(channelName: string): boolean {
  return pendingTopicRemovals.has(cmRtTopicKey(channelName));
}
