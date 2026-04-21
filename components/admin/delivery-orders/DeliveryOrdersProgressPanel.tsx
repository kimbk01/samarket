"use client";

import { useMemo } from "react";
import type { AdminDeliveryOrder, OrderListFilters, OrderStatus } from "@/lib/admin/delivery-orders-admin/types";
import { ORDER_STATUS_LABEL } from "@/lib/admin/delivery-orders-admin/labels";

type Bucket = "" | "in_progress" | "issues";

function countBy(
  orders: AdminDeliveryOrder[],
  pred: (o: AdminDeliveryOrder) => boolean
): number {
  return orders.reduce((n, o) => n + (pred(o) ? 1 : 0), 0);
}

const IN_PROGRESS: OrderStatus[] = ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived"];
const ISSUES: OrderStatus[] = ["cancel_requested", "cancelled", "refund_requested", "refunded"];

export function DeliveryOrdersProgressPanel({
  orders,
  filters,
  onChange,
}: {
  orders: AdminDeliveryOrder[];
  filters: OrderListFilters;
  onChange: (f: OrderListFilters) => void;
}) {
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = countBy(orders, (o) => o.orderStatus === "pending");
    const ing = countBy(orders, (o) => IN_PROGRESS.includes(o.orderStatus));
    const done = countBy(orders, (o) => o.orderStatus === "completed");
    const issues = countBy(orders, (o) => ISSUES.includes(o.orderStatus));
    return { total, pending, ing, done, issues };
  }, [orders]);

  const chip = (
    label: string,
    count: number,
    active: boolean,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col items-center rounded-ui-rect border px-2 py-2 text-center transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:py-2.5 ${
        active
          ? "border-signature bg-signature/5 text-sam-fg ring-1 ring-signature/30"
          : "border-sam-border bg-sam-surface text-sam-fg hover:border-sam-border"
      }`}
    >
      <span className="sam-text-xxs font-semibold sm:text-xs">{label}</span>
      <span className="font-mono text-sm font-bold tabular-nums">{count}</span>
    </button>
  );

  const bucketActive = (b: Bucket) =>
    filters.pipelineBucket === b && !filters.orderStatus;

  const singleActive = (s: OrderStatus) =>
    filters.orderStatus === s && !filters.pipelineBucket;

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-sam-fg">배달·포장 진행 현황</h2>
        <p className="sam-text-xxs text-sam-muted">불러온 실주문 기준 · 칩을 누르면 아래 목록 필터가 맞춰집니다</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chip(
          "전체",
          stats.total,
          !filters.orderStatus && !filters.pipelineBucket,
          () => onChange({ ...filters, orderStatus: "", pipelineBucket: "" })
        )}
        {chip(
          ORDER_STATUS_LABEL.pending,
          stats.pending,
          singleActive("pending"),
          () => onChange({ ...filters, orderStatus: "pending", pipelineBucket: "" })
        )}
        {chip(
          "진행 중",
          stats.ing,
          bucketActive("in_progress"),
          () => onChange({ ...filters, orderStatus: "", pipelineBucket: "in_progress" })
        )}
        {chip(
          ORDER_STATUS_LABEL.delivering,
          countBy(orders, (o) => o.orderStatus === "delivering"),
          singleActive("delivering"),
          () => onChange({ ...filters, orderStatus: "delivering", pipelineBucket: "" })
        )}
        {chip(
          ORDER_STATUS_LABEL.completed,
          stats.done,
          singleActive("completed"),
          () => onChange({ ...filters, orderStatus: "completed", pipelineBucket: "" })
        )}
        {chip(
          "취소·환불",
          stats.issues,
          bucketActive("issues"),
          () => onChange({ ...filters, orderStatus: "", pipelineBucket: "issues" })
        )}
      </div>
    </div>
  );
}
