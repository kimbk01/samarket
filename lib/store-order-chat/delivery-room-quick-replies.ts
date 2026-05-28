import type { MessageKey } from "@/lib/i18n/messages";

/** 구매자 배달·주문 채팅 — 빠른 답장( composer 상단 ) */
export const DELIVERY_BUYER_QUICK_REPLY_KEYS = [
  "store_delivery_chat_quick_confirm",
  "store_delivery_chat_quick_door",
  "store_delivery_chat_quick_address",
  "store_delivery_chat_quick_call",
] as const satisfies readonly MessageKey[];

/** 매장주 배달·주문 채팅 — 빠른 답장 */
export const DELIVERY_OWNER_QUICK_REPLY_KEYS = [
  "store_owner_quick_reply_late",
  "store_owner_quick_reply_door",
  "store_owner_quick_reply_ingredients",
  "store_owner_quick_reply_call",
] as const satisfies readonly MessageKey[];

export type DeliveryBuyerQuickReplyKey = (typeof DELIVERY_BUYER_QUICK_REPLY_KEYS)[number];
export type DeliveryOwnerQuickReplyKey = (typeof DELIVERY_OWNER_QUICK_REPLY_KEYS)[number];
