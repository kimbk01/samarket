import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import {
  pickLanguageFallback,
  safeTranslate,
  type SafeTranslateOptions,
} from "@/lib/i18n/safe-translate";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import { systemChatLineForOrderStatus } from "@/lib/shared-order-chat/chat-message-builder";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import {
  chatMessageKey,
  chatMessageKeyWithPrep,
} from "@/lib/stores/store-order-process-model";

export type StoreOrderOpsI18nT = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

const STORE_ORDER_OPS_FALLBACKS: Partial<
  Record<MessageKey, Pick<SafeTranslateOptions, "fallbackKo" | "fallbackEn">>
> = {
  store_delivery_ops_title_accepted: { fallbackKo: "주문 접수", fallbackEn: "Order received" },
  store_delivery_ops_title_preparing: { fallbackKo: "조리 시작", fallbackEn: "Preparing" },
  store_delivery_ops_title_ready: { fallbackKo: "조리 완료", fallbackEn: "Ready" },
  store_delivery_ops_title_delivering: { fallbackKo: "배달 시작", fallbackEn: "Out for delivery" },
  store_delivery_ops_title_arrived: { fallbackKo: "도착", fallbackEn: "Arrived" },
  store_delivery_ops_title_completed: { fallbackKo: "완료", fallbackEn: "Complete" },
  store_delivery_ops_title_progress: { fallbackKo: "주문 진행", fallbackEn: "Order update" },
  store_delivery_ops_body_accepted: {
    fallbackKo: "주문을 접수했습니다.",
    fallbackEn: "Your order has been accepted.",
  },
  store_delivery_ops_body_accepted_prep: {
    fallbackKo: "주문을 접수했습니다. 예상 준비 시간을 안내드릴게요.",
    fallbackEn: "Your order has been accepted. We will share the estimated prep time.",
  },
  store_delivery_ops_body_preparing: {
    fallbackKo: "주문을 준비하고 있습니다.",
    fallbackEn: "Your order is being prepared.",
  },
  store_delivery_ops_body_ready_delivery: {
    fallbackKo: "준비가 완료되었습니다. 곧 배달을 시작합니다.",
    fallbackEn: "Your order is ready. Delivery will start soon.",
  },
  store_delivery_ops_body_ready_pickup: {
    fallbackKo: "준비가 완료되었습니다. 픽업 대기 중입니다.",
    fallbackEn: "Your order is ready for pickup.",
  },
  store_delivery_ops_body_delivering: {
    fallbackKo: "배달을 시작했습니다.",
    fallbackEn: "Delivery has started.",
  },
  store_delivery_ops_body_completed_delivery: {
    fallbackKo: "배달이 완료되었습니다.",
    fallbackEn: "Delivery is complete.",
  },
  store_delivery_ops_body_completed_pickup: {
    fallbackKo: "주문이 완료되었습니다. 픽업해 주세요.",
    fallbackEn: "Your order is complete. Please pick it up.",
  },
  store_delivery_ops_body_generic: {
    fallbackKo: "주문 상태가 업데이트되었습니다.",
    fallbackEn: "Your order status has been updated.",
  },
};

/** UI `t()` — key 노출 방지 fallback 포함 */
export function storeOrderOpsSafeT(
  lang: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const opts = STORE_ORDER_OPS_FALLBACKS[key];
  return safeTranslate(lang, key, { ...opts, vars });
}

function translateOpsKey(t: StoreOrderOpsI18nT, key: MessageKey, vars?: Record<string, string | number>): string {
  const out = t(key, vars).trim();
  if (!out || out === key || looksLikeMessageKey(out)) {
    const lang = getRuntimeAppLanguage();
    const fb = STORE_ORDER_OPS_FALLBACKS[key];
    return (
      pickLanguageFallback(lang, fb) ??
      storeOrderOpsSafeT(lang, "store_delivery_ops_body_generic")
    );
  }
  return out;
}

/** 타임라인 배지(주문 접수·조리 시작 등) */
export function storeOrderOpsStatusTitleKey(orderStatus: string, lineKind: string): MessageKey {
  if (lineKind === "warning") return "store_delivery_ops_title_warning";
  switch (orderStatus) {
    case "pending":
      return "store_delivery_ops_title_pending";
    case "accepted":
      return "store_delivery_ops_title_accepted";
    case "preparing":
      return "store_delivery_ops_title_preparing";
    case "ready_for_pickup":
      return "store_delivery_ops_title_ready";
    case "delivering":
      return "store_delivery_ops_title_delivering";
    case "arrived":
      return "store_delivery_ops_title_arrived";
    case "completed":
      return "store_delivery_ops_title_completed";
    default:
      return "store_delivery_ops_title_progress";
  }
}

export function parseStoreOrderAcceptedPrepMinutes(content: string): number | null {
  const m = content.match(/(?:약\s*)?(\d+)\s*분/);
  if (!m) return null;
  const n = Math.floor(Number(m[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isDeliveryFlow(lineKind: string, metadata: Record<string, unknown> | null): boolean {
  if (lineKind === "delivery") return true;
  const ds = metadata?.deliveryStatus;
  if (typeof ds === "string" && ds.trim()) return true;
  const flow = metadata?.orderFlow;
  if (flow === "delivery") return true;
  if (flow === "pickup") return false;
  return true;
}

/** DB에 저장된 한국어 본문 대신 UI 언어로 표시 */
export function resolveStoreOrderOpsBodyText(input: {
  orderStatus: string;
  lineKind: string;
  content: string;
  metadata: Record<string, unknown> | null;
  t: StoreOrderOpsI18nT;
}): string {
  const { orderStatus, lineKind, content, metadata, t } = input;
  const trimmed = content.trim();
  const metaKey = typeof metadata?.message_key === "string" ? metadata.message_key.trim() : "";
  if (metaKey && looksLikeMessageKey(metaKey)) {
    const vars =
      metadata?.message_vars && typeof metadata.message_vars === "object"
        ? (metadata.message_vars as Record<string, string | number>)
        : undefined;
    const translated = translateOpsKey(t, metaKey as MessageKey, vars);
    if (translated && translated !== metaKey && !looksLikeMessageKey(translated)) {
      return translated;
    }
  }
  if (trimmed.startsWith("store_delivery_ops_") && looksLikeMessageKey(trimmed)) {
    return translateOpsKey(t, trimmed as MessageKey);
  }
  const delivery = isDeliveryFlow(lineKind, metadata);
  const status = (orderStatus || "").trim() as SharedOrderStatus;

  if (status === "accepted") {
    const mins = parseStoreOrderAcceptedPrepMinutes(content);
    if (mins != null) {
      return translateOpsKey(t, "store_delivery_ops_body_accepted_prep", { minutes: mins });
    }
    return translateOpsKey(t, "store_delivery_ops_body_accepted");
  }
  if (status === "preparing") return translateOpsKey(t, "store_delivery_ops_body_preparing");
  if (status === "ready_for_pickup") {
    return delivery
      ? translateOpsKey(t, "store_delivery_ops_body_ready_delivery")
      : translateOpsKey(t, "store_delivery_ops_body_ready_pickup");
  }
  if (status === "delivering") return translateOpsKey(t, "store_delivery_ops_body_delivering");
  if (status === "completed") {
    return delivery
      ? translateOpsKey(t, "store_delivery_ops_body_completed_delivery")
      : translateOpsKey(t, "store_delivery_ops_body_completed_pickup");
  }

  const flow: OrderChatFlow = delivery ? "delivery" : "pickup";
  const fromCatalog = systemChatLineForOrderStatus(status, flow);
  if (fromCatalog?.trim() && !looksLikeMessageKey(fromCatalog)) return fromCatalog;
  if (trimmed && !looksLikeMessageKey(trimmed)) return trimmed;
  return translateOpsKey(t, "store_delivery_ops_body_generic");
}

/** 배지 라벨 — key 문자열이 화면에 나가지 않게 */
export function resolveStoreOrderOpsTitleText(input: {
  orderStatus: string;
  lineKind: string;
  t: StoreOrderOpsI18nT;
}): string {
  const key = storeOrderOpsStatusTitleKey(input.orderStatus, input.lineKind);
  return translateOpsKey(input.t, key);
}

function fulfillmentFromChatFlow(flow: OrderChatFlow): string {
  return flow === "delivery" ? "local_delivery" : "pickup";
}

/** 서버 system 메시지 본문(기본 ko 저장 — UI는 `message_key`·orderStatus로 재번역) */
export function storeOrderMessengerStatusLineContent(
  status: SharedOrderStatus,
  flow: OrderChatFlow,
  opts?: { prepMinutes?: number; language?: AppLanguageCode }
): string | null {
  const lang = opts?.language ?? DEFAULT_APP_LANGUAGE;
  const t: StoreOrderOpsI18nT = (key, vars) => translate(lang, key, vars);
  const fulfillment = fulfillmentFromChatFlow(flow);
  const key =
    status === "accepted"
      ? chatMessageKeyWithPrep(status, fulfillment, opts?.prepMinutes)
      : chatMessageKey(status, fulfillment);
  if (key) {
    if (key === "store_delivery_ops_body_accepted_prep" && opts?.prepMinutes) {
      return t(key, { minutes: opts.prepMinutes });
    }
    return t(key);
  }
  return systemChatLineForOrderStatus(status, flow, lang);
}
