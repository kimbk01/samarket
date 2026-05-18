"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberOrder } from "@/lib/member-orders/types";
import { memberOrderStatusUserMessage } from "@/lib/member-orders/member-order-labels";
import { MemberOrderStatusBadge } from "./MemberOrderStatusBadge";
import { formatMoneyPhp } from "@/lib/utils/format";

function titleSummary(
  items: MemberOrder["items"],
  formatMore: (first: string, count: number) => string
) {
  if (items.length === 0) return "";
  const first = items[0]!.menu_name;
  const rest = items.length - 1;
  return rest > 0 ? formatMore(first, rest) : first;
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
  const { t, language } = useI18n();
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
  const chatUnread = order.order_chat_unread_count ?? 0;

  return (
    <article
      className={`rounded-ui-rect border bg-sam-surface p-4 shadow-sm ${
        activeTab ? "border-sam-border ring-1 ring-sam-border" : "border-sam-border-soft"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="sam-text-body font-bold text-sam-fg">{order.store_name}</p>
          <p className="font-mono sam-text-xxs text-sam-meta">{order.order_no}</p>
          <p className="mt-1 text-xs text-sam-meta">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        <MemberOrderStatusBadge status={order.order_status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-ui-rect px-2 py-0.5 sam-text-xxs font-bold ${
            order.order_type === "delivery" ? "bg-signature/5 text-sam-fg" : "bg-teal-50 text-teal-900"
          }`}
        >
          {order.order_type === "delivery" ? t("member_order_delivery_short") : t("member_order_pickup_short")}
        </span>
        {order.request_message ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 sam-text-xxs font-bold text-amber-900">
            {t("member_order_has_request")}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-sam-fg">
        {titleSummary(order.items, (first, count) => t("member_order_items_more", { first, count }))}
      </p>
      <p className="mt-2 text-lg font-bold text-sam-fg">{formatMoneyPhp(order.total_amount)}</p>
      <p className="mt-2 text-sm text-sam-muted">
        {memberOrderStatusUserMessage(order.order_status, language)}
      </p>

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
            {chatUnread > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {chatUnread > 99 ? "99+" : chatUnread}
              </span>
            ) : null}
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
