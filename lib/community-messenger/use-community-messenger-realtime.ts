"use client";

/**
 * Realtime 정책 (커뮤니티 메신저)
 *
 * - **구독 수**: 홈은 방 id 를 `in.(…)` 청크로 묶어 WS 채널 수를 줄임 (`HOME_ROOMS_IN_FILTER_MAX`).
 * - **방 번들**: 방당 단일 채널에 messages / participants / rooms / call_* postgres_changes 를 묶음.
 * - **메타 refresh**: 멤버·방 설정 변경은 연속 이벤트가 많아 디바운스로 `onRefresh` 호출을 합침 — 수치는 `messenger-latency-config.ts` (home-sync 단일 비행으로 폭주 완화).
 * - **메시지**: INSERT/UPDATE/DELETE 는 콜백으로만 처리; 파싱 실패 시에만 짧은 지연 refresh.
 * - **typing / presence**: 현재 스키마 훅에 없음 — 추가 시 **별 토픽·초경량 페이로드**만 (전체 방 refresh 금지).
 *
 * 상세: `docs/messenger-realtime-policy.md`
 */

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  messengerMonitorRealtimeMessageInsertDelay,
  messengerMonitorRealtimeSubscriptionOutcome,
} from "@/lib/community-messenger/monitoring/client";
import {
  MESSENGER_HOME_META_DEBOUNCE_MS,
  MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS,
  MESSENGER_ROOM_META_DEBOUNCE_MS,
  MESSENGER_VOICE_AUX_DEBOUNCE_MS,
} from "@/lib/community-messenger/messenger-latency-config";
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
  messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice";
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
      row.message_type === "image" ||
      row.message_type === "file" ||
      row.message_type === "system" ||
      row.message_type === "call_stub" ||
      row.message_type === "voice"
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
    const refreshScheduler = createRefreshScheduler(callbackRef, MESSENGER_HOME_META_DEBOUNCE_MS);
    const channels: RealtimeChannel[] = [];
    const roomIds = roomIdsFingerprint.length ? roomIdsFingerprint.split("\0").filter(Boolean) : [];

    const subscribe = (name: string, register: (channel: RealtimeChannel) => RealtimeChannel) => {
      const scope = name.split(":").slice(0, 3).join(":") || name;
      const channel = register(sb.channel(name)).subscribe((status) => {
        if (status === "SUBSCRIBED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, true, status);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, false, status);
        }
      });
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
      .subscribe((status) => {
        const scope = `community-messenger-home:call-logs`;
        if (status === "SUBSCRIBED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, true, status);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, false, status);
        }
      });
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
    const messageFallbackRefreshScheduler = createRefreshScheduler(
      callbackRef,
      MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS
    );
    /** 멤버·방 설정 변경은 연속 이벤트가 많아 묶음 → 단일 GET 부담 감소 */
    const metaRefreshScheduler = createRefreshScheduler(callbackRef, MESSENGER_ROOM_META_DEBOUNCE_MS);
    const callRefreshScheduler = createRefreshScheduler(callbackRef, 0);
    /** 음성 INSERT 직후 GET 이 비는 경우 대비 — 지연 refresh 로 채팅 목록·스냅샷을 한 번 더 맞춤 */
    const voiceRefreshScheduler = createRefreshScheduler(callbackRef, MESSENGER_VOICE_AUX_DEBOUNCE_MS);
    const channels: RealtimeChannel[] = [];

    /** 한 Realtime 채널에 postgres_changes 만 묶어 WS 구독 수를 줄임 */
    const roomChannel = sb
      .channel(`community-messenger-room:bundle:${args.roomId}`)
      .on(
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
            if (eventType === "INSERT" && args.roomId) {
              const created = new Date(nextMessage.createdAt).getTime();
              const delay = Date.now() - created;
              if (delay >= 0 && delay < 180_000) {
                messengerMonitorRealtimeMessageInsertDelay(args.roomId, delay);
              }
            }
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
      .on(
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
      .on(
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
      .on(
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
      .on(
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
      .on(
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
      .subscribe((status) => {
        const scope = `community-messenger-room:bundle`;
        if (status === "SUBSCRIBED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, true, status);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          messengerMonitorRealtimeSubscriptionOutcome(scope, false, status);
        }
      });
    channels.push(roomChannel);

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
