import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import { orderEventMessage } from "@/lib/stores/store-order-process-model";

/** 배달/픽업에 따라 시스템 안내 톤을 나눕니다. */
export type OrderChatFlow = "delivery" | "pickup";

/**
 * 채팅방 시스템 문장 — 4단계 정본 사건 문장 위임 (`store-order-process-model` · 설계안 v2 §3-3).
 */
export function systemChatLineForOrderStatus(
  status: SharedOrderStatus,
  flow: OrderChatFlow = "pickup",
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  const msg = orderEventMessage(status, flow === "delivery" ? "local_delivery" : "pickup");
  if (!msg) return null;
  return translate(language, msg.key, msg.params);
}
