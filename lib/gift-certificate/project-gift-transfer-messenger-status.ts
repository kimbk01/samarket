import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  parseGiftCertificateMessageMetadata,
  type GiftCertificateMessageMetadata,
} from "@/lib/gift-certificate/gift-certificate-message-metadata";

function buildGiftTransferMessengerBumpMessage(args: {
  row: {
    id: string;
    room_id: string;
    sender_id: string | null;
    content: string | null;
    metadata: unknown;
    created_at: string | null;
  };
  transferId: string;
  transferStatus: NonNullable<GiftCertificateMessageMetadata["transfer_status"]>;
}): CommunityMessengerMessage | null {
  const id = String(args.row.id ?? "").trim();
  const roomId = String(args.row.room_id ?? "").trim();
  const senderId = String(args.row.sender_id ?? "").trim();
  if (!id || !roomId || !senderId) return null;
  const prevMeta =
    args.row.metadata && typeof args.row.metadata === "object" && !Array.isArray(args.row.metadata)
      ? (args.row.metadata as Record<string, unknown>)
      : {};
  const metadata =
    parseGiftCertificateMessageMetadata({
      ...prevMeta,
      gift_transfer_id: args.transferId,
      transfer_status: args.transferStatus,
    }) ?? {
      gift_transfer_id: args.transferId,
      transfer_status: args.transferStatus,
    };
  return {
    id,
    roomId,
    senderId,
    senderLabel: "",
    messageType: "gift_certificate",
    content: String(args.row.content ?? "").trim() || "Gift certificate",
    createdAt: String(args.row.created_at ?? "").trim() || new Date().toISOString(),
    metadata,
    clientMessageId: null,
    isMine: false,
    callKind: null,
    callStatus: null,
  };
}

/**
 * After accept/reject/cancel money RPC: best-effort sync of chat card metadata.
 * Never invents ownership — financial RPC already committed.
 */
export async function projectGiftTransferMessengerStatus(
  sb: SupabaseClient,
  args: {
    transferId: string;
    transferStatus: NonNullable<GiftCertificateMessageMetadata["transfer_status"]>;
    /** User who triggered accept/reject/cancel — bump `fromUserId` for peer timeline merge. */
    actorUserId: string;
  }
): Promise<void> {
  const transferId = args.transferId.trim();
  if (!transferId) return;

  const { data: transfer } = await sb
    .from(GIFT_TABLES.transfers)
    .select("messenger_message_id, room_id, sender_user_id, recipient_user_id")
    .eq("id", transferId)
    .maybeSingle();
  const messageId = String(
    (transfer as { messenger_message_id?: string | null } | null)?.messenger_message_id ?? ""
  ).trim();
  if (!messageId) return;

  const { data: msg } = await sb
    .from("community_messenger_messages")
    .select("id, room_id, sender_id, content, metadata, created_at")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return;

  const prev =
    msg.metadata && typeof msg.metadata === "object" && !Array.isArray(msg.metadata)
      ? (msg.metadata as Record<string, unknown>)
      : {};
  const nextMetadata = {
    ...prev,
    gift_transfer_id: transferId,
    transfer_status: args.transferStatus,
  };
  const { error: updateError } = await sb
    .from("community_messenger_messages")
    .update({
      metadata: nextMetadata,
    })
    .eq("id", messageId);
  if (updateError) return;

  const roomId = String(
    (transfer as { room_id?: string | null } | null)?.room_id ??
      (msg as { room_id?: string | null }).room_id ??
      ""
  ).trim();
  const senderUserId = String(
    (transfer as { sender_user_id?: string | null } | null)?.sender_user_id ?? ""
  ).trim();
  const recipientUserId = String(
    (transfer as { recipient_user_id?: string | null } | null)?.recipient_user_id ?? ""
  ).trim();
  const actorUserId = args.actorUserId.trim();
  if (roomId) {
    invalidateRoomBootstrapSnapshotCache(
      roomId,
      [senderUserId, recipientUserId].filter(Boolean)
    );
  }

  const messageForBump = buildGiftTransferMessengerBumpMessage({
    row: {
      id: messageId,
      room_id: roomId || String((msg as { room_id?: string }).room_id ?? ""),
      sender_id: String((msg as { sender_id?: string | null }).sender_id ?? senderUserId) || null,
      content: String((msg as { content?: string | null }).content ?? ""),
      metadata: nextMetadata,
      created_at: String((msg as { created_at?: string | null }).created_at ?? ""),
    },
    transferId,
    transferStatus: args.transferStatus,
  });
  if (!roomId || !actorUserId || !messageForBump) return;

  try {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: roomId,
      canonicalRoomId: roomId,
      fromUserId: actorUserId,
      messageId,
      messageCreatedAt: messageForBump.createdAt,
      messageForBump,
      skipBadgeTargetBump: true,
    });
  } catch {
    /* postgres UPDATE remains authority; bump accelerates open-room merge */
  }
}
