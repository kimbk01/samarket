import type { MessageKey } from "@/lib/i18n/messages";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT } from "@/lib/stores/store-order-process-model";

/** Admin order status labels — 4단계 정본 이름 (사장님·손님·채팅과 같은 말 · 설계안 v2 §3-1) */
export const ADMIN_STORE_ORDER_STATUS_LABEL_KEYS: Record<StoreOrderStatus, MessageKey> =
  ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT;
