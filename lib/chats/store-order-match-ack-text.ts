/** 구매자 자동 전송 문구 — 매장 수신 알림 트리거에도 사용 */
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

export const STORE_ORDER_MATCH_ACK_MESSAGE = "주문 내용이 일치합니다.";

export function getStoreOrderMatchAckMessage(language: AppLanguageCode = DEFAULT_APP_LANGUAGE): string {
  return translate(language, "store_order_match_ack");
}
