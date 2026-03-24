/** 식당·배달 주문 시뮬 알림 — Supabase notifications / push 로 교체 예정 */

export type NotificationRole = "member" | "owner" | "admin";

export type SharedNotificationType =
  | "new_order"
  | "order_accepted"
  | "preparing"
  | "delivering"
  | "arrived"
  | "ready_for_pickup"
  | "completed"
  | "cancel_requested"
  | "cancelled"
  | "refund_requested"
  | "refunded"
  | "settlement_held"
  | "settlement_released"
  | "admin_note"
  | "dispute"
  | "chat_message"
  | "admin_chat_message"
  | "order_system_message"
  | "chat_blocked"
  | "chat_unblocked";

export type NotificationPreferenceKey =
  | "allow_new_order"
  | "allow_order_status"
  | "allow_cancel"
  | "allow_refund"
  | "allow_settlement"
  | "allow_admin_notice"
  | "allow_marketing";

export interface SharedNotification {
  id: string;
  role: NotificationRole;
  target_user_id: string;
  /** 오너 알림 시 매장 구분, 회원·관리자는 null 가능 */
  target_store_id: string | null;
  linked_order_id: string;
  type: SharedNotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  priority: "normal" | "high";
}

export interface NotificationPreferences {
  role: NotificationRole;
  user_id: string;
  allow_new_order: boolean;
  allow_order_status: boolean;
  allow_cancel: boolean;
  allow_refund: boolean;
  allow_settlement: boolean;
  allow_admin_notice: boolean;
  allow_marketing: boolean;
}

export type OrderNotificationDraft = {
  role: NotificationRole;
  target_user_id: string;
  target_store_id: string | null;
  linked_order_id: string;
  type: SharedNotificationType;
  title: string;
  message: string;
  preference: NotificationPreferenceKey;
  priority?: "normal" | "high";
};
