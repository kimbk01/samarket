"use client";

import Link from "next/link";
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
  onOpenCancel,
}: {
  order: MemberOrder;
  detailHref: string;
  onOpenCancel?: (order: MemberOrder) => void;
}) {
  const activeTab = [
    "pending",
    "accepted",
    "preparing",
    "delivering",
    "ready_for_pickup",
    "arrived",
  ].includes(order.order_status);
  const canCancelRequest = order.order_status === "pending" || order.order_status === "accepted";

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        activeTab ? "border-violet-200 ring-1 ring-violet-100" : "border-gray-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-gray-900">{order.store_name}</p>
          <p className="font-mono text-[11px] text-gray-400">{order.order_no}</p>
          <p className="mt-1 text-xs text-gray-400">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        <MemberOrderStatusBadge status={order.order_status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
            order.order_type === "delivery" ? "bg-violet-50 text-violet-900" : "bg-teal-50 text-teal-900"
          }`}
        >
          {order.order_type === "delivery" ? "배달" : "포장"}
        </span>
        {order.request_message ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            요청있음
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-gray-700">{titleSummary(order.items)}</p>
      <p className="mt-2 text-lg font-bold text-gray-900">{formatMoneyPhp(order.total_amount)}</p>
      <p className="mt-2 text-sm text-gray-600">{MEMBER_STATUS_USER_MESSAGE[order.order_status]}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={detailHref}
          className="flex-1 rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white"
        >
          상세보기
        </Link>
        {canCancelRequest && onOpenCancel ? (
          <button
            type="button"
            onClick={() => onOpenCancel(order)}
            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700"
          >
            취소 요청
          </button>
        ) : null}
      </div>
    </article>
  );
}
