/**
 * Gift transfer offer — room-scoped atomic transfer + messenger message projection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { giftCertificateOffer } from "@/lib/gift-certificate/gift-certificate-rpc";
import {
  buildGiftOfferCommunityMessengerMessage,
  parseGiftOfferRpcSuccess,
} from "@/lib/gift-certificate/gift-offer-canonical-message";
import { notifyGiftTransferOffered } from "@/lib/gift-certificate/notify-gift-transfer";

export type GiftTransferOfferInput = {
  senderUserId: string;
  instanceId: string;
  recipientUserId: string;
  roomId: string;
  idempotencyKey: string;
  senderLabel?: string;
};

export type GiftTransferOfferResult =
  | {
      ok: true;
      transferId: string;
      messageId: string;
      roomId: string;
      recipientUserId: string;
      message: CommunityMessengerMessage;
      idempotent?: boolean;
    }
  | { ok: false; error: string; data?: Record<string, unknown> };

export async function executeGiftTransferOffer(
  sb: SupabaseClient,
  input: GiftTransferOfferInput
): Promise<GiftTransferOfferResult> {
  const roomId = input.roomId.trim();
  const instanceId = input.instanceId.trim();
  const recipientUserId = input.recipientUserId.trim();
  if (!roomId || !instanceId || !recipientUserId || !input.idempotencyKey.trim()) {
    return { ok: false, error: "invalid_args" };
  }

  const result = await giftCertificateOffer(sb, {
    senderUserId: input.senderUserId,
    instanceId,
    recipientUserId,
    roomId,
    idempotencyKey: input.idempotencyKey.trim(),
  });

  if (!result.ok) {
    return { ok: false, error: result.error, data: result.data };
  }

  const parsed = parseGiftOfferRpcSuccess(result.data);
  if (!parsed) {
    return { ok: false, error: "message_projection_missing", data: result.data };
  }

  const message = buildGiftOfferCommunityMessengerMessage({
    offer: parsed,
    senderUserId: input.senderUserId,
    senderLabel: input.senderLabel?.trim() || "",
  });

  const transferId = parsed.transfer_id;
  const messageId = parsed.message_id;

  await notifyGiftTransferOffered(sb, {
    recipientUserId,
    senderUserId: input.senderUserId,
    transferId,
    roomId,
    instanceId,
  }).catch(() => {});

  try {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: roomId,
      canonicalRoomId: roomId,
      fromUserId: input.senderUserId,
      messageId,
      messageCreatedAt: message.createdAt,
      messageForBump: {
        ...message,
        isMine: false,
      },
    });
  } catch {
    /* DB message + postgres realtime remain authority; bump is acceleration */
  }

  return {
    ok: true,
    transferId,
    messageId,
    roomId,
    recipientUserId,
    message,
    idempotent: result.data.idempotent === true,
  };
}
