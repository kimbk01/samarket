"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

function useStableCallback(callback: () => void) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}

function createRefreshScheduler(callbackRef: MutableRefObject<() => void>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      callbackRef.current();
    }, 250);
  };
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  enabled: boolean;
  onRefresh: () => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const scheduleRefresh = createRefreshScheduler(callbackRef);
    const channels: RealtimeChannel[] = [];

    const subscribe = (name: string, register: (channel: RealtimeChannel) => RealtimeChannel) => {
      const channel = register(sb.channel(name)).subscribe();
      channels.push(channel);
    };

    subscribe(`community-messenger-home:participants:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_participants",
          filter: `user_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-home:rooms:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_rooms",
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-home:requests:incoming:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_friend_requests",
          filter: `addressee_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-home:requests:outgoing:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_friend_requests",
          filter: `requester_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-home:favorites:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_friend_favorites",
          filter: `user_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-home:relationships:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_relationships",
          filter: `user_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    return () => {
      cancelled = true;
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, args.userId, callbackRef]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  enabled: boolean;
  onRefresh: () => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const scheduleRefresh = createRefreshScheduler(callbackRef);
    const channels: RealtimeChannel[] = [];

    const subscribe = (name: string, register: (channel: RealtimeChannel) => RealtimeChannel) => {
      const channel = register(sb.channel(name)).subscribe();
      channels.push(channel);
    };

    subscribe(`community-messenger-room:messages:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_messages",
          filter: `room_id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-room:participants:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_participants",
          filter: `room_id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-room:rooms:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_rooms",
          filter: `id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-room:calls:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_logs",
          filter: `room_id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    subscribe(`community-messenger-room:call-sessions:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_sessions",
          filter: `room_id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) scheduleRefresh();
        }
      )
    );

    return () => {
      cancelled = true;
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, args.roomId, callbackRef]);
}
