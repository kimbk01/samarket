"use client";

import type { OrderListFilters } from "@/lib/admin/delivery-orders-mock/types";
import { ORDER_STATUS_LABEL, PAYMENT_LABEL, SETTLEMENT_LABEL } from "@/lib/admin/delivery-orders-mock/labels";
import type { OrderStatus, PaymentStatus, SettlementStatus } from "@/lib/admin/delivery-orders-mock/types";

const OS_KEYS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
const PS_KEYS = Object.keys(PAYMENT_LABEL) as PaymentStatus[];
const SS_KEYS = Object.keys(SETTLEMENT_LABEL) as SettlementStatus[];

export function OrderFilterBar({
  filters,
  onChange,
}: {
  filters: OrderListFilters;
  onChange: (f: OrderListFilters) => void;
}) {
  const patch = (p: Partial<OrderListFilters>) => {
    const next = { ...filters, ...p };
    if ("orderStatus" in p && p.orderStatus !== undefined) next.pipelineBucket = "";
    if ("pipelineBucket" in p && p.pipelineBucket) next.orderStatus = "";
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <p className="text-sm font-semibold text-sam-fg">필터</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-sam-muted">
          시작일
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          종료일
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => patch({ dateTo: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          주문 상태
          <select
            value={filters.orderStatus}
            onChange={(e) => patch({ orderStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">전체</option>
            {OS_KEYS.map((k) => (
              <option key={k} value={k}>
                {ORDER_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          결제 상태
          <select
            value={filters.paymentStatus}
            onChange={(e) => patch({ paymentStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">전체</option>
            {PS_KEYS.map((k) => (
              <option key={k} value={k}>
                {PAYMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          정산 상태
          <select
            value={filters.settlementStatus}
            onChange={(e) => patch({ settlementStatus: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">전체</option>
            {SS_KEYS.map((k) => (
              <option key={k} value={k}>
                {SETTLEMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          주문 방식
          <select
            value={filters.orderType}
            onChange={(e) => patch({ orderType: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
          >
            <option value="">전체</option>
            <option value="delivery">배달</option>
            <option value="pickup">포장</option>
          </select>
        </label>
        <label className="block text-xs text-sam-muted">
          매장·운영자
          <input
            value={filters.storeQuery}
            onChange={(e) => patch({ storeQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="매장명·슬러그·ID·사장님"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          주문자
          <input
            value={filters.buyerQuery}
            onChange={(e) => patch({ buyerQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="이름·전화·회원 ID"
          />
        </label>
        <label className="block text-xs text-sam-muted">
          주문번호
          <input
            value={filters.orderNoQuery}
            onChange={(e) => patch({ orderNoQuery: e.target.value })}
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="FD-…"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.reportsOnly}
            onChange={(e) => patch({ reportsOnly: e.target.checked })}
          />
          신고 건만
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.heldSettlementOnly}
            onChange={(e) => patch({ heldSettlementOnly: e.target.checked })}
          />
          정산 보류만
        </label>
      </div>
    </div>
  );
}
