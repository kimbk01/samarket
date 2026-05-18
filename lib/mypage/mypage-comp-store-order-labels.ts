import type { MessageKey } from "@/lib/i18n/messages";

export type MypageCompTFn = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

export function storeOrderEventLabel(t: MypageCompTFn, eventType: string): string {
  const key = `mypage_comp_event_${eventType}` as MessageKey;
  const label = t(key);
  return label !== key ? label : eventType;
}

export function storeOrderActorLabel(t: MypageCompTFn, role: string): string {
  const key = `mypage_comp_actor_${role}` as MessageKey;
  const label = t(key);
  return label !== key ? label : role;
}

export function buyerOrderStatusLabel(t: MypageCompTFn, status: string): string {
  const key = `mypage_comp_order_status_${status}` as MessageKey;
  const label = t(key);
  return label !== key ? label : status;
}

export function fulfillmentTypeLabel(t: MypageCompTFn, type: string): string {
  const key = `mypage_comp_fulfill_${type}` as MessageKey;
  const label = t(key);
  return label !== key ? label : type;
}
