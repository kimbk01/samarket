import type { SharedOrder } from "@/lib/shared-orders/types";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate, translateText } from "@/lib/i18n/messages";
import { DEMO_ADMIN_USER_ID } from "./constants";
import type { OrderNotificationDraft } from "./types";

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

function orderLabel(o: SharedOrder) {
  return `${o.store_name} · ${o.order_no}`;
}

export function buildOrderNotificationDrafts(
  o: SharedOrder,
  event: OrderNotifyEvent,
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): OrderNotificationDraft[] {
  const nt = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(language, key, vars);
  const oid = o.id;
  const sid = o.store_id;
  const out: OrderNotificationDraft[] = [];

  switch (event.kind) {
    case "order_created":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "new_order",
          title: nt("notify_order_received_title"),
          message: nt("notify_order_received_message"),
          preference: "allow_new_order",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "new_order",
          title: nt("notify_new_order_title"),
          message: nt("notify_new_order_message"),
          preference: "allow_new_order",
        }
      );
      break;

    case "owner_accepted":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "order_accepted",
        title: nt("notify_order_checked_title"),
        message: nt("notify_order_checked_message"),
        preference: "allow_order_status",
      });
      break;

    case "owner_preparing":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "preparing",
        title: nt("notify_preparing_title"),
        message: nt("notify_preparing_message"),
        preference: "allow_order_status",
      });
      break;

    case "owner_delivering":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "delivering",
        title: nt("notify_delivery_started_title"),
        message: nt("notify_delivery_started_message"),
        preference: "allow_order_status",
      });
      break;

    case "owner_arrived":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "arrived",
        title: nt("notify_arrived_title"),
        message: nt("notify_arrived_message"),
        preference: "allow_order_status",
      });
      break;

    case "owner_ready_for_pickup":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "ready_for_pickup",
        title: nt("notify_pickup_ready_title"),
        message:
          o.order_type === "delivery"
            ? nt("notify_pickup_ready_delivery_message")
            : nt("notify_pickup_ready_message"),
        preference: "allow_order_status",
      });
      break;

    case "owner_completed":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "completed",
          title: nt("notify_order_completed_title"),
          message: nt("notify_order_completed_message"),
          preference: "allow_order_status",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "completed",
          title: nt("notify_settlement_scheduled_title"),
          message: nt("notify_settlement_scheduled_message", { label: orderLabel(o) }),
          preference: "allow_settlement",
        }
      );
      break;

    case "member_cancel_requested":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "cancel_requested",
          title: nt("notify_cancel_requested_title"),
          message: nt("notify_cancel_requested_message"),
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancel_requested",
          title: nt("notify_cancel_requested_title"),
          message: nt("notify_customer_cancel_requested_message"),
          preference: "allow_cancel",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "cancel_requested",
          title: nt("notify_cancel_pending_title"),
          message: nt("notify_cancel_pending_message", { label: orderLabel(o) }),
          preference: "allow_cancel",
          priority: "high",
        }
      );
      break;

    case "member_refund_requested":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "refund_requested",
          title: nt("notify_refund_requested_title"),
          message: nt("notify_refund_requested_message"),
          preference: "allow_refund",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "refund_requested",
          title: nt("notify_refund_requested_title"),
          message: nt("notify_refund_requested_message"),
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refund_requested",
          title: nt("notify_refund_requested_title"),
          message: nt("notify_refund_requested_admin_message", { label: orderLabel(o) }),
          preference: "allow_refund",
          priority: "high",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "settlement_held",
          title: nt("notify_settlement_hold_needed_title"),
          message: nt("notify_settlement_hold_needed_message", { label: orderLabel(o) }),
          preference: "allow_settlement",
        }
      );
      break;

    case "owner_refund_problem":
      out.push(
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "refund_requested",
          title: nt("notify_refund_review_title"),
          message: nt("notify_refund_requested_message"),
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "dispute",
          title: nt("notify_dispute_order_title"),
          message: nt("notify_dispute_order_message", { label: orderLabel(o) }),
          preference: "allow_admin_notice",
          priority: "high",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refund_requested",
          title: nt("notify_refund_requested_title"),
          message: nt("notify_refund_requested_admin_message", { label: orderLabel(o) }),
          preference: "allow_refund",
          priority: "high",
        }
      );
      break;

    case "owner_rejected":
      out.push({
        role: "member",
        target_user_id: o.buyer_user_id,
        target_store_id: null,
        linked_order_id: oid,
        type: "cancelled",
        title: nt("notify_order_cancelled_title"),
        message: nt("notify_order_rejected_message", { reason: event.reason }),
        preference: "allow_cancel",
      });
      break;

    case "admin_cancel_approved":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "cancelled",
          title: nt("notify_order_cancelled_title"),
          message: nt("notify_order_cancelled_message"),
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancelled",
          title: nt("notify_admin_cancel_title"),
          message: nt("notify_admin_cancel_message"),
          preference: "allow_cancel",
        }
      );
      break;

    case "admin_forced_cancel":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "cancelled",
          title: nt("notify_order_cancelled_title"),
          message: nt("notify_order_cancelled_with_reason_message", {
            reasonText: event.reason ? ` (${event.reason})` : "",
          }),
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancelled",
          title: nt("notify_admin_cancel_title"),
          message: nt("notify_admin_cancel_message"),
          preference: "allow_cancel",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "dispute",
          title: nt("notify_force_change_title"),
          message: nt("notify_force_change_message", { label: orderLabel(o) }),
          preference: "allow_admin_notice",
          priority: "high",
        }
      );
      break;

    case "admin_refund_approved":
      out.push(
        {
          role: "member",
          target_user_id: o.buyer_user_id,
          target_store_id: null,
          linked_order_id: oid,
          type: "refunded",
          title: nt("notify_refund_completed_title"),
          message: nt("notify_refund_completed_message"),
          preference: "allow_refund",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "refunded",
          title: nt("notify_refund_approved_title"),
          message: nt("notify_refund_approved_message"),
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refunded",
          title: nt("notify_refund_processed_title"),
          message: nt("notify_refund_processed_message", { label: orderLabel(o) }),
          preference: "allow_refund",
        }
      );
      break;

    case "admin_hold_settlement":
      out.push(
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "settlement_held",
          title: nt("notify_settlement_hold_title"),
          message: nt("notify_settlement_hold_message", { reason: event.reason }),
          preference: "allow_settlement",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "settlement_held",
          title: nt("notify_settlement_hold_title"),
          message: nt("notify_settlement_hold_needed_message", { label: orderLabel(o) }),
          preference: "allow_settlement",
          priority: "high",
        }
      );
      break;

    case "admin_release_settlement":
      out.push({
        role: "owner",
        target_user_id: o.owner_user_id,
        target_store_id: sid,
        linked_order_id: oid,
        type: "settlement_released",
        title: nt("notify_settlement_release_title"),
        message: nt("notify_settlement_release_message"),
        preference: "allow_settlement",
      });
      break;

    case "admin_memo":
      out.push({
        role: "owner",
        target_user_id: o.owner_user_id,
        target_store_id: sid,
        linked_order_id: oid,
        type: "admin_note",
        title: nt("notify_admin_memo_title"),
        message: nt("notify_admin_memo_message", { memo: event.memo.slice(0, 200) }),
        preference: "allow_admin_notice",
      });
      break;

    case "admin_forced_review":
      out.push({
        role: "admin",
        target_user_id: DEMO_ADMIN_USER_ID,
        target_store_id: null,
        linked_order_id: oid,
        type: "dispute",
        title: nt("notify_review_needed_title"),
        message: nt("notify_review_needed_message", {
          label: orderLabel(o),
          reasonText: event.reason ? ` ${event.reason}` : "",
        }),
        preference: "allow_marketing",
        priority: "high",
      });
      break;

    default:
      break;
  }

  if (language === "ko") return out;
  return out.map((draft) => ({
    ...draft,
    title: translateText(language, draft.title),
    message: translateText(language, draft.message),
  }));
}
