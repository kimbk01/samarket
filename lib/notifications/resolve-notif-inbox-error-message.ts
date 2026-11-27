import type { MessageKey } from "@/lib/i18n/messages";

/** `MyNotificationsView` 등 인박스 오류 코드 → i18n 키 */
export function resolveNotifInboxErrorMessageKey(code: string): MessageKey | null {
  switch (code) {
    case "load_failed":
      return "notif_inbox_error_load_failed";
    case "network_error":
      return "common_network_error";
    case "delete_failed":
      return "notif_inbox_error_delete_failed";
    case "failed":
      return "notif_inbox_error_failed";
    /** 가격 제안 수락 후 채팅 연결 실패 (`acceptPriceOffer` — 서버는 코드만 보낸다) */
    case "offer_accept_chat_failed":
      return "offer_err_chat_connect_failed";
    default:
      return null;
  }
}
