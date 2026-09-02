/**
 * Canonical gift-offer messenger message — server RPC result → client timeline merge.
 */

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { GiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";
import { parseGiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";

export type GiftOfferRpcSuccess = {
  transfer_id: string;
  message_id: string;
  room_id: string;
  recipient_user_id?: string;
  created_at?: string;
  content?: string;
  metadata?: GiftCertificateMessageMetadata & { public_gift_number?: string | null };
};

export function parseGiftOfferRpcSuccess(data: Record<string, unknown>): GiftOfferRpcSuccess | null {
  const transferId = String(data.transfer_id ?? "").trim();
  const messageId = String(data.message_id ?? "").trim();
  const roomId = String(data.room_id ?? "").trim();
  if (!transferId || !messageId || !roomId) return null;
  const metaRaw = data.metadata;
  const metadata =
    metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? (metaRaw as GiftCertificateMessageMetadata & { public_gift_number?: string | null })
      : undefined;
  return {
    transfer_id: transferId,
    message_id: messageId,
    room_id: roomId,
    recipient_user_id:
      data.recipient_user_id != null ? String(data.recipient_user_id).trim() : undefined,
    created_at: data.created_at != null ? String(data.created_at) : undefined,
    content: data.content != null ? String(data.content) : undefined,
    metadata,
  };
}

export function buildGiftOfferCommunityMessengerMessage(args: {
  offer: GiftOfferRpcSuccess;
  senderUserId: string;
  senderLabel: string;
}): CommunityMessengerMessage {
  const metadata =
    args.offer.metadata ??
    ({
      gift_transfer_id: args.offer.transfer_id,
      transfer_status: "PENDING",
    } satisfies GiftCertificateMessageMetadata);
  const parsed = parseGiftCertificateMessageMetadata(metadata);
  return {
    id: args.offer.message_id,
    roomId: args.offer.room_id,
    senderId: args.senderUserId,
    senderLabel: args.senderLabel,
    messageType: "gift_certificate",
    content: args.offer.content?.trim() || "Gift certificate",
    createdAt: args.offer.created_at?.trim() || new Date().toISOString(),
    metadata: parsed ?? metadata,
    clientMessageId: null,
    isMine: true,
    callKind: null,
    callStatus: null,
  };
}
