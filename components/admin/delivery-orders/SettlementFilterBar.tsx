"use client";

import type { SettlementStatus } from "@/lib/admin/delivery-orders-mock/types";
import { SETTLEMENT_LABEL } from "@/lib/admin/delivery-orders-mock/labels";

export interface SettlementListFilters {
  settlementStatus: "" | SettlementStatus;
  storeQuery: string;
  heldOnly: boolean;
}

const STATUSES: ("" | SettlementStatus)[] = [
  "",
  "scheduled",
  "processing",
  "paid",
  "held",
  "cancelled",
];

export function SettlementFilterBar({
  filters,
  onChange,
}: {
  filters: SettlementListFilters;
  onChange: (f: SettlementListFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-sam-muted">정산상태</span>
        <select
          className="rounded border border-sam-border px-2 py-1.5 text-xs"
          value={filters.settlementStatus}
          onChange={(e) =>
            onChange({ ...filters, settlementStatus: e.target.value as SettlementListFilters["settlementStatus"] })
          }
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? SETTLEMENT_LABEL[s] : "전체"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[160px] flex-col gap-1">
        <span className="text-xs font-medium text-sam-muted">매장 검색</span>
        <input
          className="rounded border border-sam-border px-2 py-1.5 text-xs"
          placeholder="매장명"
          value={filters.storeQuery}
          onChange={(e) => onChange({ ...filters, storeQuery: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 pb-1 text-xs">
        <input
          type="checkbox"
          checked={filters.heldOnly}
          onChange={(e) => onChange({ ...filters, heldOnly: e.target.checked })}
        />
        정산 보류만
      </label>
    </div>
  );
}
