"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS,
  MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS,
  MESSENGER_ROOM_META_DEBOUNCE_MS,
  MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS,
  MESSENGER_VOICE_AUX_DEBOUNCE_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import { bindCommunityMessengerHomeRealtimeChannels } from "@/lib/community-messenger/realtime/community-messenger-home-realtime-channels";
import { attachCommunityMessengerRoomCallPostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-call-realtime-channel";
import { attachCommunityMessengerRoomMetaPostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-meta-realtime-channel";
import { attachCommunityMessengerRoomMessagePostgresHandlers } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import { createRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { syncSupabaseRealtimeAuthFromSession, waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";
import { SAMARKET_REALTIME_TOKEN_REFRESH_EVENT } from "@/lib/supabase/realtime-auth-events";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { cmRtLogAuthEpochBump } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";

export type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

type HomeRealtimeListener = {
  onRefresh: () => void;
  onRealtimeMessageInsert?: (hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void;
  onParticipantUnreadDelta?: (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void;
};

type RoomRealtimeListener = {
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
};

type HomeRealtimeEntry = {
  authEpoch: number;
  listeners: Set<MutableRefObject<HomeRealtimeListener>>;
  stop: () => void;
};

type RoomRealtimeEntry = {
  authEpoch: number;
  listeners: Set<MutableRefObject<RoomRealtimeListener>>;
  stop: () => void;
};

const homeRealtimeEntries = new Map<string, HomeRealtimeEntry>();
const roomRealtimeEntries = new Map<string, RoomRealtimeEntry>();

function createRealtimeAuthBridge(args: {
  sb: NonNullable<ReturnType<typeof getSupabaseClient>>;
  isCancelled: () => boolean;
  onReady: () => void;
}): () => void {
  const { sb, isCancelled, onReady } = args;
  let authCleanup: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const cleanup = () => {
    authCleanup?.();
    authCleanup = null;
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  void (async () => {
    const authOk = await waitForSupabaseRealtimeAuth(sb);
    if (ready || isCancelled()) {
      cleanup();
      return;
    }
    if (authOk) {
      ready = true;
      cleanup();
      onReady();
      return;
    }

    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      if (ready || isCancelled() || !session?.access_token) return;
      ready = true;
      cleanup();
      onReady();
    });
    authCleanup = () => {
      try {
        data.subscription.unsubscribe();
      } catch {
        /* ignore */
      }
    };

    retryTimer = setTimeout(() => {
      if (ready || isCancelled()) return;
      void syncSupabaseRealtimeAuthFromSession(sb).then((ok) => {
        if (ready || isCancelled() || !ok) return;
        ready = true;
        cleanup();
        onReady();
      });
    }, 180);
  })();

  return cleanup;
}

function emitHomeRefresh(entry: HomeRealtimeEntry): void {
  for (const listener of entry.listeners) {
    listener.current.onRefresh();
  }
}

function emitHomeMessageInsert(entry: HomeRealtimeEntry, hint: CommunityMessengerHomeRealtimeMessageInsertHint): void {
  for (const listener of entry.listeners) {
    listener.current.onRealtimeMessageInsert?.(hint);
  }
}

function emitHomeParticipantUnread(
  entry: HomeRealtimeEntry,
  hint: CommunityMessengerHomeRealtimeParticipantUnreadHint
): void {
  for (const listener of entry.listeners) {
    listener.current.onParticipantUnreadDelta?.(hint);
  }
}

function emitRoomRefresh(entry: RoomRealtimeEntry): void {
  for (const listener of entry.listeners) {
    listener.current.onRefresh();
  }
}

function emitRoomMessageEvent(entry: RoomRealtimeEntry, event: CommunityMessengerRoomRealtimeMessageEvent): void {
  for (const listener of entry.listeners) {
    listener.current.onMessageEvent?.(event);
  }
}

function createHomeRealtimeEntry(args: {
  key: string;
  userId: string;
  roomIdsFingerprint: string;
  authEpoch: number;
}): HomeRealtimeEntry {
  const sb = getSupabaseClient();
  const entry: HomeRealtimeEntry = {
    authEpoch: args.authEpoch,
    listeners: new Set(),
    stop: () => undefined,
  };
  if (!sb) return entry;

  let cancelled = false;
  const channels: Array<{ stop: () => void }> = [];
  let cancelSchedulers: (() => void) | null = null;
  let authBridgeCleanup: (() => void) | null = null;
  let homeBound = false;

  const bindHomeChannels = () => {
    if (cancelled || homeBound) return;
    homeBound = true;
    const { channels: next, cancelSchedulers: cancel } = bindCommunityMessengerHomeRealtimeChannels({
      sb,
      userId: args.userId,
      isCancelled: () => cancelled,
      roomIdsFingerprint: args.roomIdsFingerprint,
      messageInsertHintRef: { current: (hint) => emitHomeMessageInsert(entry, hint) },
      participantUnreadDeltaRef: { current: (hint) => emitHomeParticipantUnread(entry, hint) },
      onRefreshRef: { current: () => emitHomeRefresh(entry) },
    });
    cancelSchedulers = cancel;
    for (const item of next) channels.push(item);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindHomeChannels,
  });

  entry.stop = () => {
    cancelled = true;
    authBridgeCleanup?.();
    authBridgeCleanup = null;
    cancelSchedulers?.();
    cancelSchedulers = null;
    for (const item of channels) item.stop();
    channels.length = 0;
    homeRealtimeEntries.delete(args.key);
  };

  return entry;
}

function createRoomRealtimeEntry(args: {
  key: string;
  roomId: string;
  viewerForChannel: string;
  authEpoch: number;
}): RoomRealtimeEntry {
  const sb = getSupabaseClient();
  const entry: RoomRealtimeEntry = {
    authEpoch: args.authEpoch,
    listeners: new Set(),
    stop: () => undefined,
  };
  if (!sb) return entry;

  let cancelled = false;
  const channels: Array<{ stop: () => void }> = [];
  let cancelSchedulers: (() => void) | null = null;
  let authBridgeCleanup: (() => void) | null = null;
  let roomBound = false;

  const bindRoomChannels = () => {
    if (cancelled || roomBound) return;
    roomBound = true;

    const messageFallbackRefreshScheduler = createRefreshScheduler(
      { current: () => emitRoomRefresh(entry) },
      MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS
    );
    const metaRefreshScheduler = createRefreshScheduler(
      { current: () => emitRoomRefresh(entry) },
      MESSENGER_ROOM_META_DEBOUNCE_MS
    );
    const roomCallBundleRefreshScheduler = createRefreshScheduler(
      { current: () => emitRoomRefresh(entry) },
      MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS
    );
    const voiceRefreshScheduler = createRefreshScheduler(
      { current: () => emitRoomRefresh(entry) },
      MESSENGER_VOICE_AUX_DEBOUNCE_MS
    );
    const subscribedResyncScheduler = createRefreshScheduler(
      { current: () => emitRoomRefresh(entry) },
      MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS
    );
    cancelSchedulers = () => {
      messageFallbackRefreshScheduler.cancel();
      metaRefreshScheduler.cancel();
      roomCallBundleRefreshScheduler.cancel();
      voiceRefreshScheduler.cancel();
      subscribedResyncScheduler.cancel();
    };

    let roomBundleSubscribedCount = 0;
    const roomBundle = subscribeWithRetry({
      sb,
      name: `community-messenger-room:bundle:${args.viewerForChannel}:${args.roomId}`,
      logStreamRoomId: args.roomId,
      scope: "community-messenger-room:bundle",
      isCancelled: () => cancelled,
      onStatus: (status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        roomBundleSubscribedCount += 1;
        if (roomBundleSubscribedCount === 1) {
          emitRoomRefresh(entry);
        } else {
          subscribedResyncScheduler.schedule();
        }
      },
      onAfterSubscribeFailure: (_status, attempt) => {
        if (cancelled) return;
        if (attempt >= 2) messageFallbackRefreshScheduler.schedule();
      },
      build: (channel) => {
        let c = attachCommunityMessengerRoomMessagePostgresHandlers(channel, {
          roomId: args.roomId,
          isCancelled: () => cancelled,
          messageCallbackRef: { current: (event) => emitRoomMessageEvent(entry, event) },
          messageFallbackRefreshScheduler,
          roomCallBundleRefreshScheduler,
          voiceRefreshScheduler,
        });
        c = attachCommunityMessengerRoomMetaPostgresHandlers(c, {
          roomId: args.roomId,
          isCancelled: () => cancelled,
          metaRefreshScheduler,
        });
        c = attachCommunityMessengerRoomCallPostgresHandlers(c, {
          roomId: args.roomId,
          isCancelled: () => cancelled,
          roomCallBundleRefreshScheduler,
          onRefreshRef: { current: () => emitRoomRefresh(entry) },
        });
        return c;
      },
    });
    if (cancelled) {
      roomBundle.stop();
      return;
    }
    channels.push(roomBundle);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindRoomChannels,
  });

  entry.stop = () => {
    cancelled = true;
    authBridgeCleanup?.();
    authBridgeCleanup = null;
    cancelSchedulers?.();
    cancelSchedulers = null;
    for (const channel of channels) channel.stop();
    channels.length = 0;
    roomRealtimeEntries.delete(args.key);
  };

  return entry;
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  roomIds?: string[];
  enabled: boolean;
  onRefresh: () => void;
  onRealtimeMessageInsert?: (hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void;
  onParticipantUnreadDelta?: (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void;
}) {
  const listenerRef = useRef<HomeRealtimeListener>({
    onRefresh: args.onRefresh,
    onRealtimeMessageInsert: args.onRealtimeMessageInsert,
    onParticipantUnreadDelta: args.onParticipantUnreadDelta,
  });
  listenerRef.current.onRefresh = args.onRefresh;
  listenerRef.current.onRealtimeMessageInsert = args.onRealtimeMessageInsert;
  listenerRef.current.onParticipantUnreadDelta = args.onParticipantUnreadDelta;

  const roomIdsFingerprint = [...new Set((args.roomIds ?? []).filter(Boolean))].sort().join("\0");
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const key = `${args.userId}:${roomIdsFingerprint}`;
    let entry = homeRealtimeEntries.get(key);
    if (!entry || entry.authEpoch !== realtimeAuthEpoch) {
      entry?.stop();
      entry = createHomeRealtimeEntry({
        key,
        userId: args.userId,
        roomIdsFingerprint,
        authEpoch: realtimeAuthEpoch,
      });
      homeRealtimeEntries.set(key, entry);
    }
    entry.listeners.add(listenerRef);
    return () => {
      const current = homeRealtimeEntries.get(key);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
    };
  }, [args.enabled, args.userId, roomIdsFingerprint, realtimeAuthEpoch]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  viewerUserId?: string | null;
  enabled: boolean;
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
}) {
  const listenerRef = useRef<RoomRealtimeListener>({
    onRefresh: args.onRefresh,
    onMessageEvent: args.onMessageEvent,
  });
  listenerRef.current.onRefresh = args.onRefresh;
  listenerRef.current.onMessageEvent = args.onMessageEvent;

  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  const viewerForChannel = (args.viewerUserId ?? "").trim() || "anon";

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const rid = args.roomId.trim();
    if (!rid) return;
    const key = `${viewerForChannel}:${rid}`;
    let entry = roomRealtimeEntries.get(key);
    if (!entry || entry.authEpoch !== realtimeAuthEpoch) {
      entry?.stop();
      entry = createRoomRealtimeEntry({
        key,
        roomId: rid,
        viewerForChannel,
        authEpoch: realtimeAuthEpoch,
      });
      roomRealtimeEntries.set(key, entry);
    }
    entry.listeners.add(listenerRef);
    return () => {
      const current = roomRealtimeEntries.get(key);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
    };
  }, [args.enabled, args.roomId, viewerForChannel, realtimeAuthEpoch]);
}
