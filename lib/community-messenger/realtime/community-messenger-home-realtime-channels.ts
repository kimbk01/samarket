import type { MutableRefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { createRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import { MESSENGER_HOME_META_DEBOUNCE_MS } from "@/lib/community-messenger/messenger-latency-config";
import type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

/** Supabase postgres_changes `in` 필터는 값 최대 100개 — URL·엔진 한도 여유를 두고 청크 분할 */
export const COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX = 90;

export function bindCommunityMessengerHomeRealtimeChannels(args: {
  sb: SupabaseClient;
  userId: string;
  isCancelled: () => boolean;
  roomIdsFingerprint: string;
  messageInsertHintRef: MutableRefObject<((hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void) | undefined>;
  participantUnreadDeltaRef: MutableRefObject<
    ((hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void) | undefined
  >;
  onRefreshRef: MutableRefObject<() => void>;
}): { channels: Array<{ stop: () => void }>; cancelSchedulers: () => void } {
  const channels: Array<{ stop: () => void }> = [];
  const refreshScheduler = createRefreshScheduler(args.onRefreshRef, MESSENGER_HOME_META_DEBOUNCE_MS);
  const cancelled = args.isCancelled;
  const roomIds = args.roomIdsFingerprint.length ? args.roomIdsFingerprint.split("\0").filter(Boolean) : [];

  const meta = subscribeWithRetry({
    sb: args.sb,
    name: `community-messenger-home:meta:${args.userId}`,
    scope: `community-messenger-home:meta`,
    isCancelled: cancelled,
    onStatus: (status) => {
      if (status === "SUBSCRIBED" && !cancelled()) refreshScheduler.schedule();
    },
    build: (channel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_participants",
            filter: `user_id=eq.${args.userId}`,
          },
          (payload) => {
            if (!cancelled() && payload.new) {
              const row = payload.new as Record<string, unknown>;
              const roomId = typeof row.room_id === "string" ? row.room_id.trim() : "";
              if (roomId) {
                const unreadCount = Math.max(0, Number(row.unread_count ?? 0) || 0);
                const lastReadAt = typeof row.last_read_at === "string" ? row.last_read_at : null;
                const lastReadMessageId = typeof row.last_read_message_id === "string" ? row.last_read_message_id : null;
                args.participantUnreadDeltaRef.current?.({
                  roomId,
                  unreadCount,
                  lastReadAt,
                  lastReadMessageId,
                });
                return;
              }
            }
            if (!cancelled()) refreshScheduler.schedule();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_friend_requests",
            filter: `addressee_id=eq.${args.userId}`,
          },
          () => {
            if (!cancelled()) refreshScheduler.schedule();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_friend_requests",
            filter: `requester_id=eq.${args.userId}`,
          },
          () => {
            if (!cancelled()) refreshScheduler.schedule();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_friend_favorites",
            filter: `user_id=eq.${args.userId}`,
          },
          () => {
            if (!cancelled()) refreshScheduler.schedule();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_relationships",
            filter: `user_id=eq.${args.userId}`,
          },
          () => {
            if (!cancelled()) refreshScheduler.schedule();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_call_logs",
            filter: `caller_user_id=eq.${args.userId}`,
          },
          () => {
            if (!cancelled()) refreshScheduler.schedule();
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
            if (!cancelled()) refreshScheduler.schedule();
          }
        ),
  });
  if (cancelled()) {
    meta.stop();
    return { channels, cancelSchedulers: () => refreshScheduler.cancel() };
  }
  channels.push(meta);

  for (let offset = 0; offset < roomIds.length; offset += COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX) {
    if (cancelled()) break;
    const chunk = roomIds.slice(offset, offset + COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX);
    const roomsFilter = `id=in.(${chunk.join(",")})`;
    const messagesFilter = `room_id=in.(${chunk.join(",")})`;
    const roomBundle = subscribeWithRetry({
      sb: args.sb,
      name: `community-messenger-home:rooms-in:${args.userId}:${offset}`,
      scope: `community-messenger-home:rooms-in`,
      isCancelled: cancelled,
      onStatus: (status) => {
        if (status === "SUBSCRIBED" && !cancelled()) refreshScheduler.schedule();
      },
      build: (channel) =>
        channel
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_rooms",
              filter: roomsFilter,
            },
            () => {
              if (!cancelled()) refreshScheduler.schedule();
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "community_messenger_messages",
              filter: messagesFilter,
            },
            (payload) => {
              if (!cancelled() && payload.eventType === "INSERT" && payload.new) {
                const row = payload.new as Record<string, unknown>;
                const rid = typeof row.room_id === "string" ? row.room_id.trim() : "";
                if (rid) args.messageInsertHintRef.current?.({ roomId: rid, newRecord: row });
                return;
              }
              if (!cancelled()) refreshScheduler.schedule();
            }
          ),
    });
    if (cancelled()) {
      roomBundle.stop();
      break;
    }
    channels.push(roomBundle);
  }

  return { channels, cancelSchedulers: () => refreshScheduler.cancel() };
}
