import { cmStoreOrderHeadline } from "@/lib/community-messenger/cm-home-list-copy";
import type { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";

/**
 * 메시지 알림 방 종류·맥락 라벨 — 서버 푸시(`load-message-notification-display-context`)와
 * 앱 안 배너(`messenger-in-app-banner-content`)가 같은 판정을 쓴다.
 */

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function resolveEffectiveRoomKind(input: {
  roomKind?: NotificationMessageRoomKind;
  directKey?: string | null;
  roomType?: string | null;
  chatDomain?: string | null;
}): NotificationMessageRoomKind {
  const domain = trimText(input.chatDomain);
  if (domain === "general_direct") return "direct";
  if (domain === "group") return "group";
  if (domain === "trade") return "trade";
  if (domain === "store_order") return "store_order";
  if (input.roomKind) return input.roomKind;
  const roomType = trimText(input.roomType);
  if (roomType === "private_group" || roomType === "open_group") return "group";
  const dk = trimText(input.directKey);
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "store_order";
  return "direct";
}

export function resolveContextLabelFromMeta(
  meta: ReturnType<typeof parseCommunityMessengerRoomContextMeta>
): string | null {
  if (!meta) return null;
  if (meta.kind === "trade") {
    return trimText(meta.headline) || null;
  }
  if (meta.kind === "delivery") {
    const store = trimText(meta.storeDisplayName);
    const orderNo = trimText(meta.orderNo);
    if (store) return cmStoreOrderHeadline(store, orderNo);
    return trimText(meta.headline) || null;
  }
  return trimText(meta.headline) || null;
}
