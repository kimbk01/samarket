"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import { getOrderChatUnreadForMember } from "@/lib/shared-order-chat/shared-chat-store";
import type { MemberOrder } from "@/lib/member-orders/types";
import { MEMBER_STATUS_USER_MESSAGE } from "@/lib/member-orders/member-order-labels";
import { MemberOrderStatusBadge } from "./MemberOrderStatusBadge";
import { formatMoneyPhp } from "@/lib/utils/format";

function titleSummary(items: MemberOrder["items"]) {
  if (items.length === 0) return "";
  const first = items[0]!.menu_name;
  const rest = items.length - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}

export function MemberOrderCard({
  order,
  detailHref,
  chatHref,
  onOpenCancel,
}: {
  order: MemberOrder;
  detailHref: string;
  chatHref: string;
  onOpenCancel?: (order: MemberOrder) => void;
}) {
  const { t, tt } = useI18n();
  const cv = useOrderChatVersion();
  const buyerId = getDemoBuyerUserId();
  const activeTab = [
    "pending",
    "accepted",
    "preparing",
    "delivering",
    "ready_for_pickup",
    "arrived",
  ].includes(order.order_status);
  const canCancelRequest = order.order_status === "pending" || order.order_status === "accepted";
  const canOpenChat = !["cancelled", "refunded"].includes(order.order_status);
  const chatUnread = useMemo(() => {
    void cv;
    return getOrderChatUnreadForMember(order.id, buyerId);
  }, [cv, order.id, buyerId]);

  return (
    <article
      className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
        activeTab ? "border-sam-border ring-1 ring-sam-border" : "border-sam-border-soft"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-sam-fg">{order.store_name}</p>
          <p className="font-mono text-[11px] text-sam-meta">{order.order_no}</p>
          <p className="mt-1 text-xs text-sam-meta">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        <MemberOrderStatusBadge status={order.order_status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-ui-rect px-2 py-0.5 text-[11px] font-bold ${
            order.order_type === "delivery" ? "bg-signature/5 text-sam-fg" : "bg-teal-50 text-teal-900"
          }`}
        >
          {order.order_type === "delivery" ? t("member_order_delivery_short") : t("member_order_pickup_short")}
        </span>
        {order.request_message ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            {t("member_order_has_request")}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-sam-fg">{titleSummary(order.items)}</p>
      <p className="mt-2 text-lg font-bold text-sam-fg">{formatMoneyPhp(order.total_amount)}</p>
      <p className="mt-2 text-sm text-sam-muted">{tt(MEMBER_STATUS_USER_MESSAGE[order.order_status])}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={detailHref}
          className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 text-center text-sm font-semibold text-white"
        >
          {t("member_order_detail_action")}
        </Link>
        {canOpenChat ? (
          <Link
            href={chatHref}
            className="flex items-center justify-center gap-1 rounded-ui-rect border border-sam-border bg-signature/5 px-4 py-2.5 text-sm font-semibold text-sam-fg"
          >
            {t("member_order_inquiry_action")}
            <UnreadBadge count={chatUnread} />
          </Link>
        ) : null}
        {canCancelRequest && onOpenCancel ? (
          <button
            type="button"
            onClick={() => onOpenCancel(order)}
            className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-2.5 text-sm font-semibold text-red-700"
          >
            {t("member_order_cancel_action")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
