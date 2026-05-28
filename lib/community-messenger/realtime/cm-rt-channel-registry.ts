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
