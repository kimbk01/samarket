export type StoreOrderCancelActorRole = "buyer" | "owner" | "admin";

export type StoreOrderCancelActionKind =
  | "direct_cancel"
  | "request_cancel"
  | "admin_review"
  | "hidden";

export type StoreOrderCancelPolicy = {
  kind: StoreOrderCancelActionKind;
  reasonRequired: boolean;
  messageKey:
    | "store_owner_cancel_policy_direct"
    | "store_owner_cancel_policy_request"
    | "store_owner_cancel_policy_admin_review"
    | "store_owner_cancel_policy_picked_up"
    | "store_owner_cancel_policy_terminal";
};

const TERMINAL_STATUSES = new Set(["cancelled", "cancel_requested", "refund_requested", "refunded", "completed"]);

function isDeliveryPickedUpOrLater(deliveryStatus: string | null | undefined): boolean {
  const s = (deliveryStatus ?? "").trim();
  return s === "pickup_in_progress" || s === "delivering" || s === "delivered" || s === "delivery_failed";
}

/**
 * Store order cancel policy — role/order status/delivery status single source.
 * Direct owner cancel is limited to before cooking starts. After that, store owners create a request.
 */
export function resolveStoreOrderCancelPolicy(input: {
  role: StoreOrderCancelActorRole;
  orderStatus: string;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
}): StoreOrderCancelPolicy {
  const status = input.orderStatus.trim();
  if (TERMINAL_STATUSES.has(status)) {
    return { kind: "hidden", reasonRequired: false, messageKey: "store_owner_cancel_policy_terminal" };
  }

  if (isDeliveryPickedUpOrLater(input.deliveryStatus)) {
    return { kind: "hidden", reasonRequired: false, messageKey: "store_owner_cancel_policy_picked_up" };
  }

  if (input.role === "admin") {
    return { kind: "direct_cancel", reasonRequired: true, messageKey: "store_owner_cancel_policy_direct" };
  }

  if (status === "pending") {
    return { kind: "direct_cancel", reasonRequired: input.role === "owner", messageKey: "store_owner_cancel_policy_direct" };
  }

  if (status === "accepted") {
    return { kind: "direct_cancel", reasonRequired: true, messageKey: "store_owner_cancel_policy_direct" };
  }

  if (status === "preparing" || status === "ready_for_pickup" || status === "delivering" || status === "arrived") {
    return { kind: "request_cancel", reasonRequired: true, messageKey: "store_owner_cancel_policy_request" };
  }

  return { kind: "hidden", reasonRequired: false, messageKey: "store_owner_cancel_policy_admin_review" };
}

export function ownerCancelActionButtonKey(policy: StoreOrderCancelPolicy): "store_owner_cancel_order_btn" | "store_owner_cancel_request_btn" | null {
  if (policy.kind === "direct_cancel") return "store_owner_cancel_order_btn";
  if (policy.kind === "request_cancel") return "store_owner_cancel_request_btn";
  return null;
}
