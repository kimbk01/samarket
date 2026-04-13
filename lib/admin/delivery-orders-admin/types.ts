/** 관리자 배달·포장 주문 UI — Supabase `store_orders` 원장과 매핑 */

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type OrderStatus =
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

export type SettlementStatus = "scheduled" | "processing" | "paid" | "held" | "cancelled";

export type AdminActionStatus =
  | "none"
  | "manual_hold"
  | "admin_cancelled"
  | "dispute_reviewing"
  | "refund_approved"
  | "refund_rejected";

export type FulfillmentType = "delivery" | "pickup";

export interface AdminDeliveryOrderItemOption {
  optionGroupName: string;
  optionName: string;
  optionPrice: number;
}

export interface AdminDeliveryOrderItem {
  id: string;
  menuName: string;
  options: AdminDeliveryOrderItemOption[];
  qty: number;
  unitPrice: number;
  optionExtra: number;
  lineTotal: number;
}

export interface AdminDeliverySettlement {
  id: string;
  grossAmount: number;
  feeAmount: number;
  settlementAmount: number;
  settlementStatus: SettlementStatus;
  holdReason?: string;
  paidAt?: string;
  scheduledDate?: string;
}

export interface CancelRequest {
  reason: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

export interface RefundRequest {
  reason: string;
  category?: string;
  requestedBy: "buyer" | "store" | "admin";
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

export interface AdminDeliveryOrder {
  id: string;
  orderNo: string;
  buyerUserId: string;
  buyerName: string;
  buyerPhone: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeOwnerUserId: string;
  storeOwnerName: string;
  orderType: FulfillmentType;
  addressSummary?: string;
  addressDetail?: string;
  pickupNote?: string;
  requestNote?: string;
  /** 매장 커머스 주문: 고객이 선택한 결제 수단 코드 */
  buyerCheckoutPaymentMethod?: string;
  items: AdminDeliveryOrderItem[];
  productAmount: number;
  optionAmount: number;
  deliveryFee: number;
  discountAmount: number;
  finalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  settlementStatus: SettlementStatus;
  adminActionStatus: AdminActionStatus;
  cancelReason?: string;
  refundReason?: string;
  adminMemo: string;
  hasReport: boolean;
  disputeMemo?: string;
  createdAt: string;
  updatedAt: string;
  settlement?: AdminDeliverySettlement;
  cancelRequest?: CancelRequest | null;
  refundRequest?: RefundRequest | null;
  /** 원장 출처 — 목록은 항상 DB */
  orderSource?: "store_db";
}

export interface OrderStatusLog {
  id: string;
  orderId: string;
  actorType: "admin" | "system" | "store" | "buyer";
  actorId: string;
  action: string;
  fromOrderStatus?: OrderStatus;
  toOrderStatus?: OrderStatus;
  fromPaymentStatus?: PaymentStatus;
  toPaymentStatus?: PaymentStatus;
  fromSettlementStatus?: SettlementStatus;
  toSettlementStatus?: SettlementStatus;
  reason?: string;
  createdAt: string;
}

export interface OrderReport {
  id: string;
  orderId: string;
  reporterUserId: string;
  reporterName: string;
  reportType: string;
  content: string;
  status: "open" | "reviewing" | "resolved" | "rejected";
  adminResult?: string;
  createdAt: string;
}

export interface OrderListFilters {
  dateFrom: string;
  dateTo: string;
  orderStatus: string;
  /** 진행 단계 묶음 필터 — `orderStatus`와 동시에 쓰면 AND */
  pipelineBucket: "" | "in_progress" | "issues";
  paymentStatus: string;
  settlementStatus: string;
  orderType: string;
  storeQuery: string;
  buyerQuery: string;
  orderNoQuery: string;
  reportsOnly: boolean;
  heldSettlementOnly: boolean;
}

export const defaultOrderListFilters: OrderListFilters = {
  dateFrom: "",
  dateTo: "",
  orderStatus: "",
  pipelineBucket: "",
  paymentStatus: "",
  settlementStatus: "",
  orderType: "",
  storeQuery: "",
  buyerQuery: "",
  orderNoQuery: "",
  reportsOnly: false,
  heldSettlementOnly: false,
};
