import type { MessageKey } from "@/lib/i18n/messages";

export type MypageT = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function storeOrderEventLabels(t: MypageT): Record<string, string> {
  return {
    order_created: t("mypage_comp_event_order_created"),
    order_accepted: t("mypage_comp_event_order_accepted"),
    order_rejected: t("mypage_comp_event_order_rejected"),
    order_preparing: t("mypage_comp_event_order_preparing"),
    order_ready: t("mypage_comp_event_order_ready"),
    order_delivering: t("mypage_comp_event_order_delivering"),
    order_completed: t("mypage_comp_event_order_completed"),
    order_cancelled: t("mypage_comp_event_order_cancelled"),
    refund_requested: t("mypage_comp_event_refund_requested"),
    refund_approved: t("mypage_comp_event_refund_approved"),
    refund_rejected: t("mypage_comp_event_refund_rejected"),
    system_note: t("mypage_comp_event_system_note"),
    delivery_status_changed: t("mypage_comp_event_delivery_status_changed"),
    order_payment_completed_buyer: t("mypage_comp_event_order_payment_completed_buyer"),
    order_payment_completed_owner: t("mypage_comp_event_order_payment_completed_owner"),
    order_payment_failed_buyer: t("mypage_comp_event_order_payment_failed_buyer"),
  };
}

export function storeOrderEventActorLabel(t: MypageT, role: string): string {
  switch (role) {
    case "buyer":
      return t("mypage_comp_actor_buyer");
    case "owner":
      return t("mypage_comp_actor_owner");
    case "rider":
      return t("mypage_comp_actor_rider");
    case "admin":
      return t("mypage_comp_actor_admin");
    case "system":
      return t("mypage_comp_actor_system");
    default:
      return role;
  }
}

export function buyerOrderStatusLabels(t: MypageT): Record<string, string> {
  return {
    pending: t("mypage_comp_order_status_pending"),
    accepted: t("mypage_comp_order_status_accepted"),
    preparing: t("mypage_comp_order_status_preparing"),
    ready_for_pickup: t("mypage_comp_order_status_ready_for_pickup"),
    delivering: t("mypage_comp_order_status_delivering"),
    arrived: t("mypage_comp_order_status_arrived"),
    completed: t("mypage_comp_order_status_completed"),
    cancelled: t("mypage_comp_order_status_cancelled"),
    refund_requested: t("mypage_comp_order_status_refund_requested"),
    refunded: t("mypage_comp_order_status_refunded"),
  };
}

export function fulfillLabels(t: MypageT): Record<string, string> {
  return {
    pickup: t("mypage_comp_fulfill_pickup"),
    local_delivery: t("mypage_comp_fulfill_local_delivery"),
    shipping: t("mypage_comp_fulfill_shipping"),
  };
}

function deliveryStatusLine(t: MypageT, status: string): string | null {
  switch (status) {
    case "waiting_rider":
      return t("mypage_comp_delivery_status_waiting_rider");
    case "rider_assigned":
      return t("mypage_comp_delivery_status_rider_assigned");
    case "pickup_in_progress":
      return t("mypage_comp_delivery_status_pickup_in_progress");
    case "delivering":
      return t("mypage_comp_delivery_status_delivering");
    case "delivered":
      return t("mypage_comp_delivery_status_delivered");
    case "delivery_failed":
      return t("mypage_comp_delivery_status_delivery_failed");
    default:
      return status ? t("mypage_comp_delivery_status_fallback", { status }) : null;
  }
}

type OrderProgressInput = {
  order_status: string;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  delivery_courier_label?: string | null;
  delivery?: {
    delivery_status?: string | null;
    customer_arrived_at?: string | null;
    delivered_confirmed_at?: string | null;
    delivered_receiver_hint?: string | null;
  } | null;
};

export function buyerStoreOrderProgressCopy(
  t: MypageT,
  order: OrderProgressInput,
  orderLabels: Record<string, string>,
  prepClock: string | null,
): { headline: string; lines: string[] } {
  const n = Math.max(0, Math.floor(Number(order.estimated_prep_minutes) || 0));
  const d = order.delivery;
  const deliveryLine = deliveryStatusLine(t, d?.delivery_status?.trim?.() ? String(d.delivery_status).trim() : "");

  switch (order.order_status) {
    case "pending":
      return {
        headline: t("mypage_comp_order_prog_pending_headline"),
        lines: [t("mypage_comp_order_prog_pending_line1")],
      };
    case "accepted": {
      const lines = [
        n > 0
          ? t("mypage_comp_order_prog_prep_minutes", { minutes: n })
          : t("mypage_comp_order_prog_prep_fallback"),
        prepClock ? t("mypage_comp_order_prog_prep_clock_labeled", { clock: prepClock }) : "",
      ].filter(Boolean);
      return { headline: t("mypage_comp_order_prog_accepted_headline"), lines };
    }
    case "preparing":
      return {
        headline: t("mypage_comp_order_prog_preparing_headline"),
        lines: prepClock
          ? [t("mypage_comp_order_prog_preparing_clock", { clock: prepClock })]
          : [t("mypage_comp_order_prog_preparing_default")],
      };
    case "delivering": {
      const lines = [
        deliveryLine,
        typeof d?.customer_arrived_at === "string" && d.customer_arrived_at.trim()
          ? t("mypage_comp_order_prog_rider_arrived")
          : null,
        order.delivery_courier_label?.trim()
          ? t("mypage_comp_order_prog_courier_label", { label: order.delivery_courier_label.trim() })
          : null,
      ].filter((x): x is string => typeof x === "string" && x.length > 0);
      return { headline: t("mypage_comp_order_prog_delivering_headline"), lines };
    }
    default: {
      const lines: string[] = [];
      if (order.order_status === "completed" && order.delivery?.delivery_status === "delivered") {
        const dc =
          typeof order.delivery.delivered_confirmed_at === "string" && order.delivery.delivered_confirmed_at.trim();
        if (dc) lines.push(t("mypage_comp_order_prog_delivery_confirmed"));
        const hint =
          typeof order.delivery.delivered_receiver_hint === "string" &&
          order.delivery.delivered_receiver_hint.trim();
        if (hint) lines.push(t("mypage_comp_order_prog_receiver_hint", { hint }));
      }
      if (deliveryLine) lines.push(deliveryLine);
      return {
        headline: orderLabels[order.order_status] ?? order.order_status,
        lines,
      };
    }
  }
}

export function paymentMethodLabel(t: MypageT, paymentStatus: string): string {
  switch (paymentStatus) {
    case "paid":
      return t("mypage_comp_pay_method_paid");
    case "pending":
      return t("mypage_comp_pay_method_pending");
    case "failed":
      return t("mypage_comp_pay_method_failed");
    case "cancelled":
      return t("mypage_comp_pay_method_cancelled");
    case "refunded":
      return t("mypage_comp_pay_method_refunded");
    default:
      return paymentStatus;
  }
}
