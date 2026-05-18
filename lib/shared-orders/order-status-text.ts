import type { MessageKey } from "@/lib/i18n/messages";
import type { SharedOrderStatus } from "./types";

type Role = "member" | "owner" | "admin";
type TranslateFn = (key: MessageKey) => string;

const MEMBER: Record<SharedOrderStatus, MessageKey> = {
  pending: "member_order_status_msg_pending",
  accepted: "member_order_status_msg_accepted",
  preparing: "member_order_status_msg_preparing",
  delivering: "member_order_status_msg_delivering",
  ready_for_pickup: "member_order_status_msg_ready_for_pickup",
  arrived: "member_order_status_msg_arrived",
  completed: "member_order_status_msg_completed",
  cancelled: "member_order_status_msg_cancelled",
  cancel_requested: "member_order_status_msg_cancel_requested",
  refund_requested: "member_order_status_msg_refund_requested",
  refunded: "member_order_status_msg_refunded",
};

const OWNER: Record<SharedOrderStatus, MessageKey> = {
  pending: "owner_order_status_msg_pending",
  accepted: "owner_order_status_msg_accepted",
  preparing: "owner_order_status_msg_preparing",
  delivering: "owner_order_status_msg_delivering",
  ready_for_pickup: "owner_order_status_msg_ready_for_pickup",
  arrived: "owner_order_status_msg_arrived",
  completed: "owner_order_status_msg_completed",
  cancelled: "owner_order_status_msg_cancelled",
  cancel_requested: "owner_order_status_msg_cancel_requested",
  refund_requested: "owner_order_status_msg_refund_requested",
  refunded: "owner_order_status_msg_refunded",
};

const ADMIN: Record<SharedOrderStatus, MessageKey> = {
  pending: "admin_order_status_msg_pending",
  accepted: "admin_order_status_msg_accepted",
  preparing: "admin_order_status_msg_preparing",
  delivering: "admin_order_status_msg_delivering",
  ready_for_pickup: "admin_order_status_msg_ready_for_pickup",
  arrived: "admin_order_status_msg_arrived",
  completed: "admin_order_status_msg_completed",
  cancelled: "admin_order_status_msg_cancelled",
  cancel_requested: "admin_order_status_msg_cancel_requested",
  refund_requested: "admin_order_status_msg_refund_requested",
  refunded: "admin_order_status_msg_refunded",
};

export function orderStatusTextForRole(
  t: TranslateFn,
  status: SharedOrderStatus,
  role: Role
): string {
  if (role === "member") return t(MEMBER[status]);
  if (role === "owner") return t(OWNER[status]);
  return t(ADMIN[status]);
}
