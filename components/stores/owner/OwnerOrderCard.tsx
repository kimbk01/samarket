"use client";

import Link from "next/link";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { OwnerOrderActionPanel } from "./OwnerOrderActionPanel";
import { OwnerOrderStatusBadge } from "./OwnerOrderStatusBadge";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { buildMessengerContextInputFromOwnerOrder } from "@/lib/community-messenger/store-order-messenger-context";

function menuSummary(items: OwnerOrder["items"]) {
  const parts = items.map((i) => `${i.menu_name}×${i.qty}`);
  const s = parts.join(", ");
  return s.length > 48 ? `${s.slice(0, 46)}…` : s;
}

export function OwnerOrderCard({
  storeId,
  slug,
  order,
  onActionDone,
}: {
  storeId: string;
  slug: string;
  order: OwnerOrder;
  onActionDone?: () => void | Promise<void>;
}) {
  const detailHref = buildStoreOrdersHref({ storeId, orderId: order.id });
  const typeBadge =
    order.order_type === "delivery" || order.order_type === "shipping"
      ? { cls: "bg-signature/5 text-sam-fg", text: "배달" }
      : { cls: "bg-teal-50 text-teal-900", text: "포장 픽업" };

  return (
    <article className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-semibold text-sam-muted">{order.order_no}</p>
          <p className="text-xs text-sam-meta">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        <OwnerOrderStatusBadge status={order.order_status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-ui-rect px-2 py-0.5 text-xs font-bold ${typeBadge.cls}`}>{typeBadge.text}</span>
        <span className="font-semibold text-sam-fg">{order.buyer_name}</span>
        {order.request_message ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 sam-text-xxs font-bold text-amber-900">요청</span>
        ) : null}
        {order.buyer_cancel_request ? (
          <span className="rounded bg-red-50 px-1.5 py-0.5 sam-text-xxs font-bold text-red-800">취소요청</span>
        ) : null}
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-sam-muted">{menuSummary(order.items)}</p>
      <p className="mt-2 text-lg font-bold text-sam-fg">{formatMoneyPhp(order.total_amount)}</p>

      <div className="mt-3 flex gap-2">
        <Link
          href={detailHref}
          className="flex-1 rounded-ui-rect bg-sam-surface-muted py-2.5 text-center text-sm font-semibold text-sam-fg"
        >
          상세보기
        </Link>
        <Link
          href={`/my/business/store-order-chat/${encodeURIComponent(order.id)}`}
          className="flex-1 rounded-ui-rect border border-sam-border bg-signature/5 py-2.5 text-center text-sm font-semibold text-sam-fg"
        >
          고객 문의
        </Link>
      </div>
      {order.community_messenger_room_id ? (
        <div className="mt-2">
          <StoreOrderMessengerDeepLink
            roomId={order.community_messenger_room_id}
            variant="compact"
            context={buildMessengerContextInputFromOwnerOrder(order)}
            className="inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center text-sm font-semibold text-sam-fg"
          />
        </div>
      ) : null}

      {order.order_status !== "completed" &&
      order.order_status !== "cancelled" &&
      order.order_status !== "refunded" &&
      order.order_status !== "refund_requested" ? (
        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <OwnerOrderActionPanel storeId={storeId} order={order} onAfterAction={onActionDone} />
        </div>
      ) : null}
    </article>
  );
}
