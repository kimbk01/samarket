import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import {
  normalizeStoreOrderCancelKind,
  orderEventMessage,
  orderStatusName,
  type StoreOrderCancelKind,
  type StoreOrderEventMessage,
} from "@/lib/stores/store-order-process-model";

/**
 * 주문 채팅 사건 줄 — 4단계 정본 사건 문장(`order_event_*`) 하나로 만들고 그린다 (Owner 2026-11-04 · 설계안 v2 §3-3).
 * 사장님·손님 같은 줄 · 보는 사람 언어로 다시 그림 · 예전 줄(옛 키·옛 본문)도 상태 값으로 새 문장을 그린다.
 */
export type StoreOrderOpsI18nT = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** UI `t()` — key 노출 방지 */
export function storeOrderOpsSafeT(
  lang: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return safeTranslate(lang, key, { vars });
}

export function parseStoreOrderAcceptedPrepMinutes(content: string): number | null {
  const m = content.match(/(?:약\s*)?(\d+)\s*분/);
  if (!m) return null;
  const n = Math.floor(Number(m[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 주문 방식(`orderFlow`)이 있으면 그것이 기준 — 픽업 주문의 `lineKind: "delivery"` 완료 줄을 배달 문장으로 잘못 그리던 결함(L24, 2026-11-08).
 * 방식 값이 없는 옛 줄만 줄 종류·배달 상태로 판정.
 */
function isDeliveryFlow(lineKind: string, metadata: Record<string, unknown> | null): boolean {
  const flow = metadata?.orderFlow;
  if (flow === "pickup") return false;
  if (flow === "delivery") return true;
  if (lineKind === "delivery") return true;
  const ds = metadata?.deliveryStatus;
  if (typeof ds === "string" && ds.trim()) return true;
  return true;
}

function isOrderEventKey(key: string): boolean {
  return key.startsWith("order_event_");
}

/** 사건 줄 본문 — 저장된 `order_event_*` 키 우선, 없으면 상태 값으로 정본 문장 */
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
  const vars =
    metadata?.message_vars && typeof metadata.message_vars === "object"
      ? (metadata.message_vars as Record<string, string | number>)
      : undefined;
  if (metaKey && isOrderEventKey(metaKey) && looksLikeMessageKey(metaKey)) {
    const out = t(metaKey as MessageKey, vars).trim();
    if (out && out !== metaKey && !looksLikeMessageKey(out)) return out;
  }
  const status = String(orderStatus ?? "").trim();
  const fulfillment = isDeliveryFlow(lineKind, metadata) ? "local_delivery" : "pickup";
  const msg = orderEventMessage(status, fulfillment, {
    prepMinutes: status === "accepted" ? parseStoreOrderAcceptedPrepMinutes(trimmed) : null,
    cancelKind: normalizeStoreOrderCancelKind(metadata?.cancel_kind),
    reason: typeof metadata?.cancel_reason === "string" ? metadata.cancel_reason : null,
  });
  if (msg) {
    const out = t(msg.key, msg.params).trim();
    if (out && out !== msg.key && !looksLikeMessageKey(out)) return out;
  }
  // 정본에 없는 예전 단계 줄(배달 「준비 완료」·「도착」)·운영팀 줄은 저장 본문 그대로
  if (metaKey && looksLikeMessageKey(metaKey)) {
    const out = t(metaKey as MessageKey, vars).trim();
    if (out && out !== metaKey && !looksLikeMessageKey(out)) return out;
  }
  return trimmed && !looksLikeMessageKey(trimmed) ? trimmed : "";
}

/** 경고 줄 머리 — 사건 줄은 머리 없이 문장만 (시안 §3-3) */
export function resolveStoreOrderOpsTitleText(input: {
  orderStatus: string;
  lineKind: string;
  t: StoreOrderOpsI18nT;
  metadata?: Record<string, unknown> | null;
}): string {
  if (input.lineKind !== "warning") return "";
  return input.t("store_delivery_ops_title_warning");
}

function fulfillmentFromChatFlow(flow: OrderChatFlow): string {
  return flow === "delivery" ? "local_delivery" : "pickup";
}

/** 서버 사건 줄 — 키·값(화면 재번역용)과 기본 언어 본문(구 앱·미리보기용) */
export function storeOrderMessengerEventLine(
  status: string,
  flow: OrderChatFlow,
  opts?: {
    prepMinutes?: number;
    cancelKind?: StoreOrderCancelKind | null;
    reason?: string | null;
    autoCancelMinutes?: number | null;
    language?: AppLanguageCode;
  }
): { content: string; message: StoreOrderEventMessage } | null {
  const message = orderEventMessage(status, fulfillmentFromChatFlow(flow), opts);
  if (!message) return null;
  return { content: translate(opts?.language ?? DEFAULT_APP_LANGUAGE, message.key, message.params), message };
}

/** @deprecated 본문만 — `storeOrderMessengerEventLine` */
export function storeOrderMessengerStatusLineContent(
  status: string,
  flow: OrderChatFlow,
  opts?: { prepMinutes?: number; language?: AppLanguageCode }
): string | null {
  return storeOrderMessengerEventLine(status, flow, opts)?.content ?? null;
}

/** 주문 상태 이름 (줄 옆 배지 등) — 정본 */
export function storeOrderOpsStatusName(
  orderStatus: string,
  flow: OrderChatFlow,
  lang: AppLanguageCode,
  cancelKind?: StoreOrderCancelKind | null
): string {
  return orderStatusName(orderStatus, fulfillmentFromChatFlow(flow), lang, cancelKind);
}
