/**
 * Gift transfer lifecycle mutation — single API/client/QA response contract.
 * Financial authority = gift_certificate_transfers; message = projection of same transfer.
 */

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  parseGiftCertificateMessageMetadata,
  type GiftCertificateMessageMetadata,
} from "@/lib/gift-certificate/gift-certificate-message-metadata";

export type GiftTransferLifecycleStatus = NonNullable<
  GiftCertificateMessageMetadata["transfer_status"]
>;

export type GiftTransferMutationTransfer = {
  id: string;
  status: GiftTransferLifecycleStatus;
  instanceId: string;
  roomId: string | null;
  messengerMessageId: string | null;
  senderUserId?: string | null;
  recipientUserId?: string | null;
};

export type GiftTransferMutationResponse = {
  ok: true;
  transfer: GiftTransferMutationTransfer;
  message: CommunityMessengerMessage;
  idempotent?: boolean;
};

export type GiftTransferMutationError = {
  ok: false;
  error: string;
  data?: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function parseLifecycleStatus(v: unknown): GiftTransferLifecycleStatus | null {
  const s = trimStr(v).toUpperCase();
  if (s === "PENDING" || s === "ACCEPTED" || s === "REJECTED" || s === "CANCELLED") return s;
  return null;
}

/** Build CommunityMessengerMessage from RPC/API message projection row. */
export function buildGiftTransferCommunityMessengerMessage(args: {
  messageRow: Record<string, unknown>;
  viewerUserId?: string | null;
  senderLabel?: string;
}): CommunityMessengerMessage | null {
  const id = trimStr(args.messageRow.id ?? args.messageRow.message_id);
  const roomId = trimStr(args.messageRow.room_id ?? args.messageRow.roomId);
  const senderId = trimStr(args.messageRow.sender_id ?? args.messageRow.senderId);
  if (!id || !roomId || !senderId) return null;
  const metaRaw = args.messageRow.metadata;
  const metadata =
    parseGiftCertificateMessageMetadata(metaRaw) ??
    (asRecord(metaRaw) as GiftCertificateMessageMetadata | null) ??
    undefined;
  const viewer = trimStr(args.viewerUserId);
  return {
    id,
    roomId,
    senderId,
    senderLabel: args.senderLabel?.trim() || "",
    messageType: "gift_certificate",
    content: trimStr(args.messageRow.content) || "Gift certificate",
    createdAt: trimStr(args.messageRow.created_at ?? args.messageRow.createdAt) || new Date().toISOString(),
    metadata: metadata ?? (asRecord(metaRaw) as Record<string, unknown> | undefined) ?? null,
    clientMessageId: null,
    isMine: viewer ? viewer === senderId : false,
    callKind: null,
    callStatus: null,
  };
}

/**
 * Decode canonical mutation response from API/RPC JSON.
 * Accepts nested `{ transfer, message }` only — no flat transfer_id / message_id pile.
 */
export function parseGiftTransferMutationResponse(
  raw: unknown,
  opts?: { viewerUserId?: string | null; senderLabel?: string }
): GiftTransferMutationResponse | GiftTransferMutationError {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "invalid_response" };
  if (row.ok === false) {
    return { ok: false, error: trimStr(row.error) || "rpc_failed", data: row };
  }

  const transferRaw = asRecord(row.transfer);
  const messageRaw = asRecord(row.message);
  if (!transferRaw || !messageRaw) {
    return { ok: false, error: "mutation_projection_missing", data: row };
  }

  const transferId = trimStr(transferRaw.id);
  const status = parseLifecycleStatus(transferRaw.status);
  const instanceId = trimStr(transferRaw.instanceId ?? transferRaw.instance_id);
  const roomIdRaw = trimStr(transferRaw.roomId ?? transferRaw.room_id);
  const messengerMessageId = trimStr(
    transferRaw.messengerMessageId ?? transferRaw.messenger_message_id
  );
  if (!transferId || !status || !instanceId) {
    return { ok: false, error: "mutation_transfer_incomplete", data: row };
  }

  const message = buildGiftTransferCommunityMessengerMessage({
    messageRow: messageRaw,
    viewerUserId: opts?.viewerUserId,
    senderLabel: opts?.senderLabel,
  });
  if (!message) {
    return { ok: false, error: "mutation_message_incomplete", data: row };
  }

  return {
    ok: true,
    transfer: {
      id: transferId,
      status,
      instanceId,
      roomId: roomIdRaw || null,
      messengerMessageId: messengerMessageId || message.id || null,
      senderUserId: trimStr(transferRaw.senderUserId ?? transferRaw.sender_user_id) || null,
      recipientUserId: trimStr(transferRaw.recipientUserId ?? transferRaw.recipient_user_id) || null,
    },
    message,
    idempotent: row.idempotent === true,
  };
}
