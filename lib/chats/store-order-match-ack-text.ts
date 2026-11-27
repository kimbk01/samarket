/**
 * 구매자 「주문 내용이 일치합니다」 자동 전송 — 매장 수신 알림 트리거에도 사용.
 * 문구는 카탈로그 `store_order_match_ack` 하나 (재감사 2026-11-27).
 *
 * - 저장 본문 `STORE_ORDER_MATCH_ACK_MESSAGE` 는 옛 행·수신 쪽 판별 호환을 위해 ko 카탈로그 값과 같다.
 * - 화면(말풍선·목록 미리보기)은 `localizeStoreOrderMatchAckText` 로 보는 사람 언어로 다시 그린다.
 *   ko·en 어느 쪽으로 저장됐든 알아본다. 그 밖의 글(사람이 쓴 내용)은 그대로 둔다.
 */
import { type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

/** 메시지 종류 코드 — 보내는 쪽이 metadata 에 넣을 때 쓴다 */
export const STORE_ORDER_MATCH_ACK_KIND = "store_order_match_ack";

export const STORE_ORDER_MATCH_ACK_MESSAGE = translate("ko", "store_order_match_ack");

export function getStoreOrderMatchAckMessage(language: AppLanguageCode): string {
  return translate(language, "store_order_match_ack");
}

/** 저장된 본문이 매칭 응답(ko·en)인지 */
export function isStoreOrderMatchAckText(text: string | null | undefined): boolean {
  const c = String(text ?? "").trim();
  if (!c) return false;
  return c === translate("ko", "store_order_match_ack") || c === translate("en", "store_order_match_ack");
}

/** 매칭 응답이면 보는 사람 언어로, 아니면 그대로 */
export function localizeStoreOrderMatchAckText(text: string, language: AppLanguageCode): string {
  return isStoreOrderMatchAckText(text) ? getStoreOrderMatchAckMessage(language) : text;
}
