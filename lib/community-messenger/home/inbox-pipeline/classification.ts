import type {
  CanonicalMessengerHomeRoom,
  MessengerHomeBucket,
} from "@/lib/community-messenger/home/inbox-pipeline/types";

function directKeyHasTradePrefix(directKey: string | null): boolean {
  const dk = directKey?.trim() ?? "";
  return dk.startsWith("trade_pc:") || dk.startsWith("trade_item:");
}

function directKeyHasDeliveryPrefix(directKey: string | null): boolean {
  const dk = directKey?.trim() ?? "";
  if (directKeyHasTradePrefix(dk)) return false;
  return dk.startsWith("store_order:") || dk.startsWith("trade_order:");
}

export function resolveMessengerHomeBucket(
  room: CanonicalMessengerHomeRoom,
  _viewerUserId: string
): MessengerHomeBucket {
  if (
    room.isArchived ||
    room.isBlockedHidden ||
    room.roomStatus === "archived" ||
    room.roomStatus === "blocked" ||
    Boolean(room.deletedAt)
  ) {
    return "excluded";
  }
  /** Domain chatDomain SSOT when present (Domain list paint slice-2). */
  if (room.chatDomain === "trade") return "trade";
  if (room.chatDomain === "store_order") return "delivery";
  if (room.chatDomain === "general_direct") return "direct";
  if (room.chatDomain === "group") return room.roomType === "private_group" ? "group" : "direct";
  if (room.contextMeta?.kind === "trade" || directKeyHasTradePrefix(room.directKey)) return "trade";
  if (room.contextMeta?.kind === "delivery" || directKeyHasDeliveryPrefix(room.directKey)) return "delivery";
  if (room.roomType === "private_group") return "group";
  if (room.roomType === "direct") return "direct";
  return "excluded";
}
