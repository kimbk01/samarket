import type { MutableRefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { createRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import { MESSENGER_HOME_META_DEBOUNCE_MS } from "@/lib/community-messenger/messenger-latency-config";
import type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  cmRtRoomSubLog,
  messengerRealtimeBumpHomeChannelPhysicalBindCount,
  messengerRealtimeGetHomeChannelPhysicalBindCount,
  messengerRealtimeRecordSubscribedMessageRoomIds,
  normalizeCmRealtimeSubscribeRoomId,
} from "@/lib/community-messenger/realtime/cm-rt-room-sub-log";
import { cmRtStableSubLog } from "@/lib/community-messenger/realtime/cm-rt-stable-sub-log";
import {
  logRtChannelLifecycle,
  logRtRebindTrace,
} from "@/lib/community-messenger/realtime/cm-rt-rebind-trace";
import {
  cmRtHs4DiagnosisLog,
  cmRtHs4FingerprintDigest,
} from "@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis";
/** Supabase postgres_changes `in` 필터는 값 최대 100개 — URL·엔진 한도 여유를 두고 청크 분할 */
export const COMMUNITY_MESSENGER_HOME_ROOMS_IN_FILTER_MAX = 90;

export function bindCommunityMessengerHomeRealtimeChannels(args: {
  sb: SupabaseClient;
  userId: string;
  isCancelled: () => boolean;
  roomIdsFingerprint: string;
  /** 진단: 메타 전용 바인드 vs rooms-in 청크 바인드 구분 */
  channelBindRole: "home_meta" | "home_rooms_in";
  includeMeta?: boolean;
  /** `extraRoomIds`(거래·배달 리스트 visible) 개수 — 구독 집합 진단용 */
  visibleTradeRoomCount?: number;
  messageInsertHintRef: MutableRefObject<((hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void) | undefined>;
  participantUnreadDeltaRef: MutableRefObject<
    ((hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void) | undefined
  >;
  onRefreshRef: MutableRefObject<() => void>;
}): { channels: Array<{ stop: () => void }>; cancelSchedulers: () => void } {
  const channels: Array<{ stop: () => void }> = [];
  const refreshScheduler = createRefreshScheduler(args.onRefreshRef, MESSENGER_HOME_META_DEBOUNCE_MS);
  const cancelled = args.isCancelled;
  cmRtStableSubLog("channel_rebind_start", {
    viewerUserId: args.userId,
    channelBindRole: args.channelBindRole,
    fingerprintLength: args.roomIdsFingerprint.length,
    rebindCountBefore: messengerRealtimeGetHomeChannelPhysicalBindCount(),
  });
  const roomIds = args.roomIdsFingerprint.length
    ? [...new Set(args.roomIdsFingerprint.split("\0").map((id) => normalizeCmRealtimeSubscribeRoomId(id)).filter(Boolean))].sort()
    : [];
  logRtRebindTrace({
    reason: "channel_rebind_start",
    roomCount: roomIds.length,
  });
  logRtChannelLifecycle({
    action: "rebind_start",
    channel: args.channelBindRole,
    subscribers: roomIds.length,
  });
  const bindOrdinal = messengerRealtimeBumpHomeChannelPhysicalBindCount();
  messengerRealtimeRecordSubscribedMessageRoomIds(roomIds);
  cmRtHs4DiagnosisLog("home_channels_bind_batch_start", {
    channelBindRole: args.channelBindRole,
    bindOrdinal,
    roomChunkCount: roomIds.length,
    visibleTradeRoomCount: args.visibleTradeRoomCount ?? 0,
    viewerUserIdTail: args.userId.length > 8 ? args.userId.slice(-8) : args.userId,
    ...cmRtHs4FingerprintDigest(args.roomIdsFingerprint),
    physicalBindCountNow: messengerRealtimeGetHomeChannelPhysicalBindCount(),
  });
  cmRtRoomSubLog("subscribed_message_room_ids", {
    viewerUserId: args.userId,
    roomIds,
    roomCount: roomIds.length,
  });

  const includeMeta = args.includeMeta !== false;
  if (includeMeta) {
    const meta = subscribeWithRetry({
      sb: args.sb,
      name: `community-messenger-home:meta:${args.userId}`,
      scope: `community-messenger-home:meta`,
      isCancelled: cancelled,
      hs4Context: {
        fingerprint: args.roomIdsFingerprint,
        channelBindRole: args.channelBindRole,
        bindOrdinal,
      },
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
                  const participantUserId =
                    typeof row.user_id === "string" ? row.user_id.trim() : String(row.user_id ?? "").trim() || null;
                  cmRtReadSyncLog("participant_update_received", {
                    channelScope: "home_meta_self",
                    roomId,
                    participantUserId,
                    unreadCount,
                    lastReadAt,
                    lastReadMessageId,
                    viewerUserId: args.userId,
                    isPeer: false,
                  });
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
              table: "community_messenger_friendships",
              filter: `requester_user_id=eq.${args.userId}`,
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
              table: "community_messenger_friendships",
              filter: `addressee_user_id=eq.${args.userId}`,
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
    cmRtReadSyncLog("subscribe_participants_channel", {
      channelScope: "home_meta_self",
      viewerUserId: args.userId,
      filter: `community_messenger_participants.user_id=eq.${args.userId}`,
    });
  }

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
      hs4Context: {
        fingerprint: args.roomIdsFingerprint,
        channelBindRole: args.channelBindRole,
        chunkOffset: offset,
        bindOrdinal,
      },
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
                const mid = typeof row.id === "string" ? row.id.trim() : "";
                const sid = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
                if (rid) {
                  cmRtReadSyncLog("message_insert_received", {
                    channelScope: "home_rooms_in",
                    roomId: rid,
                    messageId: mid || null,
                    senderId: sid || null,
                    viewerUserId: args.userId,
                  });
                  cmRtRoomSubLog("realtime_message_received", {
                    roomId: rid,
                    messageId: mid || null,
                    senderId: sid || null,
                    viewerUserId: args.userId,
                  });
                  args.messageInsertHintRef.current?.({ roomId: rid, newRecord: row });
                }
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
    cmRtReadSyncLog("subscribe_messages_channel", {
      channelScope: "home_rooms_in",
      viewerUserId: args.userId,
      chunkOffset: offset,
      chunkRoomCount: chunk.length,
      messagesFilter: messagesFilter,
    });
  }

  cmRtStableSubLog("channel_rebind_done", {
    viewerUserId: args.userId,
    channelBindRole: args.channelBindRole,
    bindOrdinal,
    rebindCount: messengerRealtimeGetHomeChannelPhysicalBindCount(),
    subscribed_room_count: roomIds.length,
    subscribed_room_ids: roomIds,
    visible_trade_room_count: args.visibleTradeRoomCount ?? 0,
    supabaseChannelInstances: channels.length,
  });

  return { channels, cancelSchedulers: () => refreshScheduler.cancel() };
}
