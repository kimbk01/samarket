/**
 * Accept / reject / cancel — money RPC already projects messenger in same TX.
 * Server helper only notifies + publishes room bump acceleration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import {
  giftCertificateAccept,
  giftCertificateCancel,
  giftCertificateReject,
} from "@/lib/gift-certificate/gift-certificate-rpc";
import {
  parseGiftTransferMutationResponse,
  type GiftTransferMutationError,
  type GiftTransferMutationResponse,
} from "@/lib/gift-certificate/gift-transfer-mutation-response";
import {
  notifyGiftTransferAccepted,
  notifyGiftTransferCancelled,
  notifyGiftTransferRejected,
} from "@/lib/gift-certificate/notify-gift-transfer";

export type GiftTransferTransitionKind = "accept" | "reject" | "cancel";

export async function executeGiftTransferTransition(
  sb: SupabaseClient,
  args: {
    kind: GiftTransferTransitionKind;
    actorUserId: string;
    transferId: string;
  }
): Promise<GiftTransferMutationResponse | GiftTransferMutationError> {
  const transferId = args.transferId.trim();
  const actorUserId = args.actorUserId.trim();
  if (!transferId || !actorUserId) {
    return { ok: false, error: "invalid_args" };
  }

  const rpc =
    args.kind === "accept"
      ? await giftCertificateAccept(sb, { recipientUserId: actorUserId, transferId })
      : args.kind === "reject"
        ? await giftCertificateReject(sb, { recipientUserId: actorUserId, transferId })
        : await giftCertificateCancel(sb, { senderUserId: actorUserId, transferId });

  if (!rpc.ok) {
    return { ok: false, error: rpc.error, data: rpc.data };
  }

  const parsed = parseGiftTransferMutationResponse(rpc.data, {
    viewerUserId: actorUserId,
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error || "mutation_projection_missing", data: rpc.data };
  }

  const roomId = parsed.transfer.roomId?.trim() || "";
  const instanceId = parsed.transfer.instanceId;

  if (args.kind === "accept") {
    await notifyGiftTransferAccepted(sb, {
      senderUserId: String(parsed.transfer.senderUserId ?? ""),
      recipientUserId: actorUserId,
      transferId: parsed.transfer.id,
      roomId: roomId || null,
      instanceId,
    }).catch(() => {});
  } else if (args.kind === "reject") {
    await notifyGiftTransferRejected(sb, {
      senderUserId: String(parsed.transfer.senderUserId ?? ""),
      recipientUserId: actorUserId,
      transferId: parsed.transfer.id,
      roomId: roomId || null,
      instanceId,
    }).catch(() => {});
  } else {
    await notifyGiftTransferCancelled(sb, {
      senderUserId: actorUserId,
      recipientUserId: String(parsed.transfer.recipientUserId ?? ""),
      transferId: parsed.transfer.id,
      roomId: roomId || null,
      instanceId,
    }).catch(() => {});
  }

  if (roomId) {
    try {
      await publishMessengerRoomBumpAfterMutation({
        rawRouteRoomId: roomId,
        canonicalRoomId: roomId,
        fromUserId: actorUserId,
        messageId: parsed.message.id,
        messageCreatedAt: parsed.message.createdAt,
        messageForBump: { ...parsed.message, isMine: false },
        skipBadgeTargetBump: true,
      });
    } catch {
      /* postgres UPDATE remains primary; bump accelerates open-room merge */
    }
  }

  return parsed;
}
