import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";
import {
  cmRtLogMapRowSkipped,
  cmRtLogPostgresPayload,
  isCommunityMessengerRealtimeDebugEnabled,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { messengerMonitorRealtimeMessageInsertDelay } from "@/lib/community-messenger/monitoring/client";
import type {
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

export function mapRealtimeMessageRow(row: Record<string, unknown> | undefined): CommunityMessengerRoomRealtimeMessageRow | null {
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id : "";
  const roomId = typeof row.room_id === "string" ? row.room_id : "";
  if (!id || !roomId) return null;
  const metadata = typeof row.metadata === "object" && row.metadata !== null ? (row.metadata as Record<string, unknown>) : {};
  const deletedForEveryoneAt =
    typeof row.deleted_for_everyone_at === "string" && row.deleted_for_everyone_at.trim()
      ? row.deleted_for_everyone_at
      : null;
  const rawContent = typeof row.content === "string" ? row.content : "";
  const replyToMessageId =
    typeof row.reply_to_message_id === "string" && row.reply_to_message_id.trim() ? row.reply_to_message_id : null;
  const replyPreviewText =
    typeof row.reply_preview_text === "string" && row.reply_preview_text.trim() ? row.reply_preview_text : null;
  const replyPreviewType =
    typeof row.reply_preview_type === "string" && row.reply_preview_type.trim() ? row.reply_preview_type : null;
  const replySenderLabelSnapshot =
    typeof row.reply_sender_label_snapshot === "string" && row.reply_sender_label_snapshot.trim()
      ? row.reply_sender_label_snapshot
      : null;
  return {
    id,
    roomId,
    senderId: typeof row.sender_id === "string" ? row.sender_id : null,
    messageType:
      row.message_type === "image" ||
      row.message_type === "file" ||
      row.message_type === "system" ||
      row.message_type === "call_stub" ||
      row.message_type === "voice" ||
      row.message_type === "sticker"
        ? row.message_type
        : "text",
    content: deletedForEveryoneAt ? resolveDeletedMessagePlaceholder() : rawContent,
    metadata,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    ...(replyToMessageId
      ? {
          replyToMessageId,
          ...(replyPreviewText != null ? { replyPreviewText } : {}),
          ...(replyPreviewType != null ? { replyPreviewType } : {}),
          ...(replySenderLabelSnapshot != null ? { replySenderLabelSnapshot } : {}),
        }
      : {}),
    ...(deletedForEveryoneAt ? { deletedForEveryoneAt } : {}),
  };
}

type Sched = { schedule: () => void; cancel: () => void };

export function attachCommunityMessengerRoomMessagePostgresHandlers(
  channel: RealtimeChannel,
  args: {
    roomId: string;
    isCancelled: () => boolean;
    messageCallbackRef: MutableRefObject<((event: CommunityMessengerRoomRealtimeMessageEvent) => void) | undefined>;
    messageFallbackRefreshScheduler: Sched;
    roomCallBundleRefreshScheduler: Sched;
    voiceRefreshScheduler: Sched;
  }
): RealtimeChannel {
  const rid = args.roomId;
  return channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "community_messenger_messages",
      filter: `room_id=eq.${rid}`,
    },
    (payload) => {
      const eventType = payload.eventType;
      const rawNew = payload.new as Record<string, unknown> | undefined;
      const rawOld = payload.old as Record<string, unknown> | undefined;
      const rowForId = eventType === "DELETE" ? rawOld : rawNew;
      const payloadRoomId = typeof rowForId?.room_id === "string" ? rowForId.room_id : null;
      const mappedId = rowForId && typeof rowForId.id === "string" ? rowForId.id : null;
      if (isCommunityMessengerRealtimeDebugEnabled()) {
        cmRtLogPostgresPayload({
          filterRoomId: rid,
          eventType,
          table: "community_messenger_messages",
          messageId: mappedId,
          payloadRoomId,
          filterMatchesPayloadRoom: Boolean(payloadRoomId && payloadRoomId === rid),
        });
      }
      const nextMessage =
        eventType === "DELETE"
          ? mapRealtimeMessageRow(payload.old as Record<string, unknown> | undefined)
          : mapRealtimeMessageRow(payload.new as Record<string, unknown> | undefined);
      if (!nextMessage && isCommunityMessengerRealtimeDebugEnabled()) {
        cmRtLogMapRowSkipped({
          reason: "mapRealtimeMessageRow_null",
          rawKeys: rowForId && typeof rowForId === "object" ? Object.keys(rowForId) : [],
        });
      }
      if (nextMessage && args.messageCallbackRef.current) {
        args.messageCallbackRef.current({
          eventType,
          message: nextMessage,
        });
        if (eventType === "INSERT" && rid) {
          const created = new Date(nextMessage.createdAt).getTime();
          const delay = Date.now() - created;
          if (delay >= 0 && delay < 180_000) {
            messengerMonitorRealtimeMessageInsertDelay(rid, delay);
          }
        }
        if (nextMessage.messageType === "call_stub" && !args.isCancelled()) {
          args.roomCallBundleRefreshScheduler.schedule();
        }
        if (nextMessage.messageType === "voice" && eventType === "INSERT" && !args.isCancelled()) {
          args.voiceRefreshScheduler.schedule();
        }
        return;
      }
      if (!args.isCancelled()) args.messageFallbackRefreshScheduler.schedule();
    }
  );
}
