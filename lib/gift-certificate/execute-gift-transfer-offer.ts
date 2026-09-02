/**
 * Gift transfer offer — room-scoped atomic transfer + messenger message projection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { giftCertificateOffer } from "@/lib/gift-certificate/gift-certificate-rpc";
import {
  parseGiftTransferMutationResponse,
  type GiftTransferMutationError,
  type GiftTransferMutationResponse,
} from "@/lib/gift-certificate/gift-transfer-mutation-response";
import { notifyGiftTransferOffered } from "@/lib/gift-certificate/notify-gift-transfer";

export type GiftTransferOfferInput = {
  senderUserId: string;
  instanceId: string;
  recipientUserId: string;
  roomId: string;
  idempotencyKey: string;
  senderLabel?: string;
};

export async function executeGiftTransferOffer(
  sb: SupabaseClient,
  input: GiftTransferOfferInput
): Promise<GiftTransferMutationResponse | GiftTransferMutationError> {
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

  const parsed = parseGiftTransferMutationResponse(result.data, {
    viewerUserId: input.senderUserId,
    senderLabel: input.senderLabel?.trim() || "",
  });
  if (!parsed.ok) {
    return { ok: false, error: "message_projection_missing", data: result.data };
  }

  const transferId = parsed.transfer.id;
  const message = { ...parsed.message, isMine: true };

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
      messageId: message.id,
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
    transfer: parsed.transfer,
    message,
    idempotent: parsed.idempotent,
  };
}
