/**
 * Owner 결정 D1 (2026-10-21) — 사용자 차단은 **일반 1:1(general_direct)** 에만 적용한다.
 * 거래(trade)·주문(store_order) 업무 채팅은 차단과 무관하게 계속 동작한다
 * (방 상태·참여·거래/주문 상태 등 다른 가드는 그대로 적용).
 *
 * Domain SSOT 는 방 생성 시 저장된 `chat_domain` 만 사용한다 (directKey·contextMeta 재추론 금지).
 * `chat_domain` NULL = legacy 일반 DM → 차단 적용.
 */
import { isChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";

const USER_BLOCK_EXEMPT_CHAT_DOMAINS: ReadonlySet<ChatDomain> = new Set<ChatDomain>(["trade", "store_order"]);

/** true = 이 도메인 방은 사용자 차단 검사(송신)·방 메뉴 차단 노출 대상이 아니다 */
export function isUserBlockExemptChatDomain(chatDomain: unknown): boolean {
  return isChatDomain(chatDomain) && USER_BLOCK_EXEMPT_CHAT_DOMAINS.has(chatDomain);
}
