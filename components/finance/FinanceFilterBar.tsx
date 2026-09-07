"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  financeFiltersToSearchParams,
  parseFinanceFilters,
  type FinanceFilterState,
} from "@/lib/finance/routes";
import { financeTypeFilterOptions } from "@/lib/finance/presentation";

export function FinanceFilterBar({
  ko,
  basePath,
}: {
  ko: boolean;
  basePath: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [draft, setDraft] = useState<FinanceFilterState>(initial);
  const typeOptions = useMemo(() => financeTypeFilterOptions(ko), [ko]);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const apply = () => {
    router.push(`${basePath}${financeFiltersToSearchParams(draft)}`);
  };

  const reset = () => {
    setDraft({});
    router.push(basePath);
  };

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-finance-filter-bar="1"
    >
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "자산" : "Wallet"}</span>
        <select
          className="mt-1 block rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.wallet ?? ""}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              wallet: (e.target.value || null) as FinanceFilterState["wallet"],
            }))
          }
        >
          <option value="">{ko ? "전체" : "All"}</option>
          <option value="POINT">Point</option>
          <option value="COIN">Coin</option>
          <option value="CASH">Cash</option>
        </select>
      </label>
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "유형" : "Type"}</span>
        <select
          className="mt-1 block max-w-[14rem] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.type ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value || null }))}
        >
          <option value="">{ko ? "전체" : "All"}</option>
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "매장 ID" : "Store ID"}</span>
        <input
          className="mt-1 block min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.storeId ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, storeId: e.target.value || null }))}
        />
      </label>
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "주문 ID" : "Order ID"}</span>
        <input
          className="mt-1 block min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.orderId ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, orderId: e.target.value || null }))}
        />
      </label>
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "시작일" : "From"}</span>
        <input
          type="date"
          className="mt-1 block rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.from ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || null }))}
        />
      </label>
      <label className="sam-text-helper">
        <span className="text-sam-muted">{ko ? "종료일" : "To"}</span>
        <input
          type="date"
          className="mt-1 block rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
          value={draft.to ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || null }))}
        />
      </label>
      <button
        type="button"
        className="rounded-ui-rect bg-signature px-3 py-1.5 text-sm font-semibold text-white"
        onClick={apply}
        data-finance-filter-apply="1"
      >
        {ko ? "필터 적용" : "Apply filters"}
      </button>
      <button
        type="button"
        className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm"
        onClick={reset}
        data-finance-filter-reset="1"
      >
        {ko ? "필터 초기화" : "Reset filters"}
      </button>
    </div>
  );
}
