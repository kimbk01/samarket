"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Supabase postgres_changes `in` 필터는 값 최대 100개 — URL·엔진 한도 여유를 두고 청크 분할 */
const HOME_ROOMS_IN_FILTER_MAX = 90;

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

export type CommunityMessengerRoomRealtimeMessageRow = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "system" | "call_stub" | "voice";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CommunityMessengerRoomRealtimeMessageEvent = {
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
  /** 배열 참조와 무관하게 id 집합이 같으면 Realtime 재구독하지 않음 */
  const roomIdsFingerprint = [...new Set((args.roomIds ?? []).filter(Boolean))].sort().join("\0");

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    /** 목록·친구·요청 등 메타 변경은 묶어서 전체 리프레시 (과도한 GET 완화) */
    const refreshScheduler = createRefreshScheduler(callbackRef, 650);
    const channels: RealtimeChannel[] = [];
    const roomIds = roomIdsFingerprint.length ? roomIdsFingerprint.split("\0").filter(Boolean) : [];

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

    /** 방당 1채널 대신 `id=in.(…)` 청크로 묶어 구독 수·재연결 비용을 줄임 (문서: in 최대 100값) */
    for (let offset = 0; offset < roomIds.length; offset += HOME_ROOMS_IN_FILTER_MAX) {
      const chunk = roomIds.slice(offset, offset + HOME_ROOMS_IN_FILTER_MAX);
      const filter = `id=in.(${chunk.join(",")})`;
      subscribe(`community-messenger-home:rooms-in:${args.userId}:${offset}`, (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_rooms",
            filter,
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

    /** 동일 테이블에 caller / peer 필터를 한 채널에 두 개의 postgres_changes 로 묶어 구독 수를 줄임 */
    const callLogsChannel = sb
      .channel(`community-messenger-home:call-logs:${args.userId}`)
      .on(
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
      .on(
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
      .subscribe();
    channels.push(callLogsChannel);

    return () => {
      cancelled = true;
      refreshScheduler.cancel();
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, roomIdsFingerprint, args.userId, callbackRef]);
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
    /** 메시지 파싱 실패 등 예외 시에만 짧은 지연으로 스냅샷 재동기화 */
    const messageFallbackRefreshScheduler = createRefreshScheduler(callbackRef, 200);
    /** 멤버·방 설정 변경은 연속 이벤트가 많아 길게 묶음 → /rooms GET 부담 감소 */
    const metaRefreshScheduler = createRefreshScheduler(callbackRef, 550);
    const callRefreshScheduler = createRefreshScheduler(callbackRef, 0);
    /** 음성 INSERT 직후 GET 이 비는 경우 대비 — 지연 refresh 로 채팅 목록·스냅샷을 한 번 더 맞춤 */
    const voiceRefreshScheduler = createRefreshScheduler(callbackRef, 500);
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
             * refresh 를 생략하면 수신 측이 채팅 줄만 갱신되고 통화 UI 가 안 뜨는 경우가 있다.
             * 음성은 먼저 로컬 병합 후, 짧은 지연으로 refresh 해 상대·채팅 목록이 비지 않게 보조한다. */
            if (nextMessage.messageType === "call_stub" && !cancelled) {
              callRefreshScheduler.schedule();
            }
            if (nextMessage.messageType === "voice" && eventType === "INSERT" && !cancelled) {
              voiceRefreshScheduler.schedule();
            }
            return;
          }
          if (!cancelled) messageFallbackRefreshScheduler.schedule();
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
          if (!cancelled) metaRefreshScheduler.schedule();
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
          if (!cancelled) metaRefreshScheduler.schedule();
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
      messageFallbackRefreshScheduler.cancel();
      metaRefreshScheduler.cancel();
      callRefreshScheduler.cancel();
      voiceRefreshScheduler.cancel();
      for (const channel of channels) {
        void sb.removeChannel(channel);
      }
    };
  }, [args.enabled, args.roomId, callbackRef]);
}
