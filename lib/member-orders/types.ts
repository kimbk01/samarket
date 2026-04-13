/** 회원 식당·배달 주문 mock — Supabase member_orders / store_orders 매핑 예정 */

export type MemberOrderType = "delivery" | "pickup";

export type MemberOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "delivering"
  | "ready_for_pickup"
  | "arrived"
  | "completed"
  | "cancelled"
  | "cancel_requested"
  | "refund_requested"
  | "refunded";

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type MemberOrderTab = "all" | "active" | "done" | "issue";

export interface MemberOrderItem {
  id: string;
  menu_name: string;
  options_summary: string;
  qty: number;
  line_total: number;
}

export interface MemberOrderLog {
  id: string;
  order_id: string;
  status: MemberOrderStatus;
  message: string;
  created_at: string;
}

export interface MemberOrder {
  id: string;
  order_no: string;
  buyer_user_id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  order_type: MemberOrderType;
  order_status: MemberOrderStatus;
  payment_status: PaymentStatus;
  product_amount: number;
  option_amount: number;
  delivery_fee: number;
  total_amount: number;
  request_message: string | null;
  delivery_address_summary: string | null;
  delivery_address_detail: string | null;
  buyer_phone: string;
  pickup_note: string | null;
  created_at: string;
  updated_at: string;
  items: MemberOrderItem[];
  logs: MemberOrderLog[];
  cancel_request_reason?: string | null;
  /** `store_orders` / API에서 내려주면 표시 — 인메모리 채팅 미사용 */
  order_chat_unread_count?: number;
}
