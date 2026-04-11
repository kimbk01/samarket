/** 매장 오너 주문 mock — 이후 Supabase store_orders / order_logs 등과 매핑 */

export type OwnerOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "delivering"
  | "arrived"
  | "completed"
  | "cancel_requested"
  | "cancelled"
  | "refund_requested"
  | "refunded";

export type OwnerOrderType = "delivery" | "pickup" | "shipping";

export type OwnerOrderTab = "all" | "new" | "active" | "done" | "issue";

export interface OwnerOrderItem {
  id: string;
  menu_name: string;
  options_summary: string;
  qty: number;
  /** 라인 합계 (수량 반영) */
  line_total: number;
}

export interface OwnerOrderLog {
  id: string;
  order_id: string;
  from_status: OwnerOrderStatus | null;
  to_status: OwnerOrderStatus | null;
  actor_type: "owner" | "system" | "buyer";
  actor_name: string;
  message?: string;
  memo?: string;
  created_at: string;
}

export interface BuyerCancelRequest {
  reason: string;
  requested_at: string;
}

export interface OwnerOrder {
  id: string;
  order_no: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  buyer_name: string;
  buyer_phone: string;
  /** 구매자 번호 `tel:` (09 DB 기준 +63) */
  buyer_phone_tel_href?: string | null;
  order_type: OwnerOrderType;
  order_status: OwnerOrderStatus;
  product_amount: number;
  option_amount: number;
  delivery_fee: number;
  total_amount: number;
  request_message: string | null;
  delivery_address: string | null;
  pickup_note: string | null;
  created_at: string;
  updated_at: string;
  items: OwnerOrderItem[];
  logs: OwnerOrderLog[];
  /** 고객 취소 요청 (샘플) */
  buyer_cancel_request?: BuyerCancelRequest | null;
  /** 문제 주문 — 관리자 연동 전 메모만 */
  problem_memo?: string | null;
  cancel_reason?: string | null;
  /** 실주문: 결제 상태 */
  payment_status?: string;
  /** 실주문: 고객이 장바구니에서 선택한 결제 수단(cod/gcash/other/…) */
  buyer_payment_method?: string | null;
  /** other 선택 시 주문 시점 매장 기타 안내 스냅샷 */
  buyer_payment_method_detail?: string | null;
  /** 연결된 커뮤니티 메신저 방 (store_orders.community_messenger_room_id) */
  community_messenger_room_id?: string | null;
  /** 실주문: 원본 수령 타입 */
  fulfillment_type?: string;
  /** 동네배달 안내(청구 금액 미포함) */
  delivery_courier_label?: string | null;
}
