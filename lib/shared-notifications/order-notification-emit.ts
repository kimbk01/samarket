import type { SharedOrder } from "@/lib/shared-orders/types";

/** `shared-order-store` 시뮬 주문 이벤트 — 실제 알림은 서버에서만 기록합니다. */
export type OrderNotifyEvent =
  | { kind: "order_created" }
  | { kind: "owner_accepted" }
  | { kind: "owner_preparing" }
  | { kind: "owner_delivering" }
  | { kind: "owner_arrived" }
  | { kind: "owner_ready_for_pickup" }
  | { kind: "owner_completed" }
  | { kind: "member_cancel_requested" }
  | { kind: "member_refund_requested" }
  | { kind: "owner_refund_problem" }
  | { kind: "owner_rejected"; reason: string }
  | { kind: "admin_cancel_approved" }
  | { kind: "admin_forced_cancel"; reason?: string }
  | { kind: "admin_refund_approved" }
  | { kind: "admin_hold_settlement"; reason: string }
  | { kind: "admin_release_settlement" }
  | { kind: "admin_memo"; memo: string }
  | { kind: "admin_forced_review"; reason?: string };

export function emitOrderNotifications(_order: SharedOrder, _event: OrderNotifyEvent): void {
  // 알림 원장은 서버(Supabase `user_notifications` 등)에서만 기록합니다.
}
