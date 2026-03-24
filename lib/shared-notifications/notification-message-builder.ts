import type { SharedOrder } from "@/lib/shared-orders/types";
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

export function buildOrderNotificationDrafts(o: SharedOrder, event: OrderNotifyEvent): OrderNotificationDraft[] {
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
          title: "주문 접수",
          message: "주문이 접수되었어요",
          preference: "allow_new_order",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "new_order",
          title: "신규 주문",
          message: "새 주문이 들어왔어요",
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
        title: "주문 확인",
        message: "매장에서 주문을 확인했어요",
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
        title: "조리 중",
        message: "음식을 준비하고 있어요",
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
        title: "배송 시작",
        message: "배송이 시작됐어요",
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
        title: "배송지 도착",
        message: "배송지에 도착했어요",
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
        title: "픽업 준비",
        message:
          o.order_type === "delivery"
            ? "출고·픽업 준비가 되었어요. 곧 배송을 시작합니다."
            : "픽업할 수 있어요",
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
          title: "주문 완료",
          message: "주문이 완료되었어요",
          preference: "allow_order_status",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "completed",
          title: "정산 예정",
          message: `완료 주문 정산 예정 건이 생겼어요 (${orderLabel(o)})`,
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
          title: "취소 요청",
          message: "취소 요청이 접수되었어요",
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancel_requested",
          title: "취소 요청",
          message: "고객이 취소를 요청했어요",
          preference: "allow_cancel",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "cancel_requested",
          title: "취소 승인 대기",
          message: `취소 승인 대기 주문이 있어요 (${orderLabel(o)})`,
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
          title: "환불 요청",
          message: "환불 요청이 접수되었어요",
          preference: "allow_refund",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "refund_requested",
          title: "환불 요청",
          message: "환불 요청이 접수되었어요",
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refund_requested",
          title: "환불 요청",
          message: `환불 요청 주문이 발생했어요 (${orderLabel(o)})`,
          preference: "allow_refund",
          priority: "high",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "settlement_held",
          title: "정산 보류 필요",
          message: `정산 보류가 필요한 주문이 생겼어요 (${orderLabel(o)})`,
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
          title: "환불 검토",
          message: "환불 요청이 접수되었어요",
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "dispute",
          title: "분쟁·문제 주문",
          message: `분쟁/문제 주문이 등록되었어요 (${orderLabel(o)})`,
          preference: "allow_admin_notice",
          priority: "high",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refund_requested",
          title: "환불 요청",
          message: `환불 요청 주문이 발생했어요 (${orderLabel(o)})`,
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
        title: "주문 취소",
        message: `매장에서 주문을 거절했어요. ${event.reason}`,
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
          title: "주문 취소",
          message: "주문이 취소되었어요",
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancelled",
          title: "관리자 취소",
          message: "주문이 관리자에 의해 취소되었어요",
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
          title: "주문 취소",
          message: `주문이 취소되었어요${event.reason ? ` (${event.reason})` : ""}`,
          preference: "allow_cancel",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "cancelled",
          title: "관리자 취소",
          message: "주문이 관리자에 의해 취소되었어요",
          preference: "allow_cancel",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "dispute",
          title: "강제 변경",
          message: `강제 확인이 필요한 주문이 있어요 (${orderLabel(o)})`,
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
          title: "환불 완료",
          message: "환불이 승인되었어요",
          preference: "allow_refund",
        },
        {
          role: "owner",
          target_user_id: o.owner_user_id,
          target_store_id: sid,
          linked_order_id: oid,
          type: "refunded",
          title: "환불 승인",
          message: "해당 주문이 환불 처리되었어요",
          preference: "allow_refund",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "refunded",
          title: "환불 처리",
          message: `환불 승인 완료 (${orderLabel(o)})`,
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
          title: "정산 보류",
          message: `정산이 보류되었어요. ${event.reason}`,
          preference: "allow_settlement",
        },
        {
          role: "admin",
          target_user_id: DEMO_ADMIN_USER_ID,
          target_store_id: null,
          linked_order_id: oid,
          type: "settlement_held",
          title: "정산 보류",
          message: `정산 보류가 필요한 주문이 생겼어요 (${orderLabel(o)})`,
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
        title: "정산 보류 해제",
        message: "정산 보류가 해제되었어요",
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
        title: "관리자 메모",
        message: `관리자 메모가 등록되었어요: ${event.memo.slice(0, 200)}`,
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
        title: "검토 필요",
        message: `강제 확인이 필요한 주문이 있어요 (${orderLabel(o)}) ${event.reason ?? ""}`.trim(),
        preference: "allow_marketing",
        priority: "high",
      });
      break;

    default:
      break;
  }

  return out;
}
