/** 3자(회원·오너·관리자) 공유 주문 시뮬레이션 — 단일 원본 */

export type SharedOrderType = "delivery" | "pickup";

export type SharedOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "delivering"
  | "ready_for_pickup"
  | "arrived"
  | "completed"
  | "cancel_requested"
  | "cancelled"
  | "refund_requested"
  | "refunded";

export type SharedPaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type SharedSettlementStatus = "scheduled" | "processing" | "held" | "paid" | "cancelled";

export type SharedAdminActionStatus =
  | "none"
  | "manual_hold"
  | "admin_cancelled"
  | "dispute_reviewing"
  | "refund_approved"
  | "refund_rejected";

export type SharedActorType = "member" | "owner" | "admin" | "system";

export type SharedActionType =
  | "created"
  | "accepted"
  | "preparing"
  | "delivering"
  | "ready_for_pickup"
  | "arrived"
  | "completed"
  | "cancel_requested"
  | "cancel_approved"
  | "cancel_rejected"
  | "cancelled"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refunded"
  | "settlement_held"
  | "settlement_released"
  | "settlement_paid"
  | "admin_force_status"
  | "admin_memo"
  | "owner_rejected";

export interface SharedOrderItem {
  id: string;
  menu_name: string;
  options_summary: string;
  qty: number;
  line_total: number;
}

export interface SharedOrderLog {
  id: string;
  order_id: string;
  actor_type: SharedActorType;
  actor_name: string;
  action_type: SharedActionType;
  from_status: SharedOrderStatus | null;
  to_status: SharedOrderStatus | null;
  message: string;
  created_at: string;
}

export interface SharedSettlement {
  id: string;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  settlement_status: SharedSettlementStatus;
  hold_reason?: string;
  scheduled_date?: string;
  paid_at?: string;
}

export interface SharedRefundRequest {
  reason: string;
  category?: string;
  requested_by: "member" | "owner" | "admin";
  requested_at: string;
  status: "pending" | "approved" | "rejected";
}

export interface SharedOrder {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  owner_user_id: string;
  owner_name: string;
  buyer_user_id: string;
  buyer_name: string;
  buyer_phone: string;
  order_type: SharedOrderType;
  order_status: SharedOrderStatus;
  payment_status: SharedPaymentStatus;
  settlement_status: SharedSettlementStatus;
  admin_action_status: SharedAdminActionStatus;
  product_amount: number;
  option_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  final_amount: number;
  request_message: string | null;
  delivery_address_summary: string | null;
  delivery_address_detail: string | null;
  pickup_note: string | null;
  cancel_request_reason: string | null;
  cancel_request_status: "none" | "pending" | "approved" | "rejected";
  cancel_reason: string | null;
  refund_reason: string | null;
  refund_request: SharedRefundRequest | null;
  admin_memo: string;
  has_report: boolean;
  dispute_memo: string | null;
  settlement: SharedSettlement | null;
  items: SharedOrderItem[];
  logs: SharedOrderLog[];
  created_at: string;
  updated_at: string;
}

export const SHARED_SIM_STORE_ID = "mock-seoul-korean";
export const SHARED_SIM_STORE_SLUG = "seoul-korean-house";
