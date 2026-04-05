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

function createRefreshScheduler(callbackRef: MutableRefObject<() => void>, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      callbackRef.current();
    }, delayMs);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return { schedule, cancel };
}

type CommunityMessengerRoomRealtimeMessageRow = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "system" | "call_stub" | "voice";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type CommunityMessengerRoomRealtimeMessageEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  message: CommunityMessengerRoomRealtimeMessageRow;
};

function mapRealtimeMessageRow(row: Record<string, unknown> | undefined): CommunityMessengerRoomRealtimeMessageRow | null {
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id : "";
  const roomId = typeof row.room_id === "string" ? row.room_id : "";
  if (!id || !roomId) return null;
  return {
    id,
    roomId,
    senderId: typeof row.sender_id === "string" ? row.sender_id : null,
    messageType:
      row.message_type === "image" || row.message_type === "system" || row.message_type === "call_stub" || row.message_type === "voice"
        ? row.message_type
        : "text",
    content: typeof row.content === "string" ? row.content : "",
    metadata: typeof row.metadata === "object" && row.metadata !== null ? (row.metadata as Record<string, unknown>) : {},
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  roomIds?: string[];
  enabled: boolean;
  onRefresh: () => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const refreshScheduler = createRefreshScheduler(callbackRef, 250);
    const channels: RealtimeChannel[] = [];
    const roomIds = [...new Set((args.roomIds ?? []).filter(Boolean))];

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
          if (!cancelled) refreshScheduler.schedule();
        }
      )
    );

    for (const roomId of roomIds) {
      subscribe(`community-messenger-home:rooms:${args.userId}:${roomId}`, (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_rooms",
            filter: `id=eq.${roomId}`,
          },
          () => {
            if (!cancelled) refreshScheduler.schedule();
          }
        )
      );
    }

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
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) refreshScheduler.schedule();
        }
      )
    );

    subscribe(`community-messenger-home:calls:caller:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_logs",
          filter: `caller_user_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) refreshScheduler.schedule();
        }
      )
    );

    subscribe(`community-messenger-home:calls:peer:${args.userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_logs",
          filter: `peer_user_id=eq.${args.userId}`,
        },
        () => {
          if (!cancelled) refreshScheduler.schedule();
        }
      )
    );

    return () => {
      cancelled = true;
      refreshScheduler.cancel();
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, args.roomIds, args.userId, callbackRef]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  enabled: boolean;
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
}) {
  const callbackRef = useStableCallback(args.onRefresh);
  const messageCallbackRef = useRef(args.onMessageEvent);

  useEffect(() => {
    messageCallbackRef.current = args.onMessageEvent;
  }, [args.onMessageEvent]);

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const refreshScheduler = createRefreshScheduler(callbackRef, 250);
    const callRefreshScheduler = createRefreshScheduler(callbackRef, 0);
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
        (payload) => {
          const eventType = payload.eventType;
          const nextMessage =
            eventType === "DELETE"
              ? mapRealtimeMessageRow(payload.old as Record<string, unknown> | undefined)
              : mapRealtimeMessageRow(payload.new as Record<string, unknown> | undefined);
          if (nextMessage && messageCallbackRef.current) {
            messageCallbackRef.current({
              eventType,
              message: nextMessage,
            });
            /* 통화 세션은 스냅샷의 activeCall 로만 오버레이·수락이 열린다. call_stub 만 로컬 병합하고
             * refresh 를 생략하면 수신 측이 채팅 줄만 갱신되고 통화 UI 가 안 뜨는 경우가 있다. */
            if (
              (nextMessage.messageType === "call_stub" || nextMessage.messageType === "voice") &&
              !cancelled
            ) {
              callRefreshScheduler.schedule();
            }
            return;
          }
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) refreshScheduler.schedule();
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
          if (!cancelled) callRefreshScheduler.schedule();
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
          if (!cancelled) callRefreshScheduler.schedule();
        }
      )
    );

    subscribe(`community-messenger-room:call-session-participants:${args.roomId}`, (channel) =>
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_session_participants",
          filter: `room_id=eq.${args.roomId}`,
        },
        () => {
          if (!cancelled) callRefreshScheduler.schedule();
        }
      )
    );

    return () => {
      cancelled = true;
      refreshScheduler.cancel();
      callRefreshScheduler.cancel();
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, args.roomId, callbackRef]);
}
