"use client";

import type { SettlementStatus } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useDoAdminStatusLabels } from "./useDoAdminStatusLabels";

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
  const { t } = useI18n();
  const { settlementStatus } = useDoAdminStatusLabels();

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-ui-rect border border-sam-border bg-sam-app/80 p-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-sam-muted">{t("admin_do_settlements_filter_status")}</span>
        <select
          className="rounded border border-sam-border px-2 py-1.5 text-xs"
          value={filters.settlementStatus}
          onChange={(e) =>
            onChange({ ...filters, settlementStatus: e.target.value as SettlementListFilters["settlementStatus"] })
          }
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s ? settlementStatus(s) : t("admin_do_common_all")}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[160px] flex-col gap-1">
        <span className="text-xs font-medium text-sam-muted">{t("admin_do_settlements_filter_store")}</span>
        <input
          className="rounded border border-sam-border px-2 py-1.5 text-xs"
          placeholder={t("admin_do_settlements_store_placeholder")}
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
        {t("admin_do_settlements_hold_only")}
      </label>
    </div>
  );
}
