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
  if (room.isArchived || room.isBlockedHidden || room.roomStatus === "archived" || room.roomStatus === "blocked") {
    return "excluded";
  }
  if (room.contextMeta?.kind === "trade" || directKeyHasTradePrefix(room.directKey)) return "trade";
  if (room.contextMeta?.kind === "delivery" || directKeyHasDeliveryPrefix(room.directKey)) return "delivery";
  if (room.roomType === "private_group") return "group";
  if (room.roomType === "direct") return "direct";
  return "excluded";
}
