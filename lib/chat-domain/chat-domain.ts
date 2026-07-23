/**
 * DIBAY Messenger Architecture LOCK — 사용자 대면 채팅의 유일한 Domain SSOT.
 *
 * Domain은 방 생성 시 한 번 저장하며 런타임에서 roomType, directKey, contextMeta,
 * FK, 제목 또는 summary로 다시 추론하지 않는다.
 */
export const CHAT_DOMAINS = [
  "general_direct",
  "group",
  "trade",
  "store_order",
] as const;

export type ChatDomain = (typeof CHAT_DOMAINS)[number];

const CHAT_DOMAIN_SET = new Set<string>(CHAT_DOMAINS);

export function isChatDomain(value: unknown): value is ChatDomain {
  return typeof value === "string" && CHAT_DOMAIN_SET.has(value);
}

export function requireChatDomain(value: unknown): ChatDomain {
  if (!isChatDomain(value)) {
    throw new Error("dibay_chat_domain_required");
  }
  return value;
}
