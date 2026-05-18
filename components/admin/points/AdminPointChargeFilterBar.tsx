"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminPointChargeFilters } from "@/lib/points/point-utils";
import type { PointChargeRequestStatus } from "@/lib/types/point";
import { pointChargeStatusLabel } from "@/components/admin/points/admin-points-notifications-i18n";

interface AdminPointChargeFilterBarProps {
  filters: AdminPointChargeFilters;
  onChange: (f: AdminPointChargeFilters) => void;
}

const STATUS_VALUES: PointChargeRequestStatus[] = [
  "pending",
  "waiting_confirm",
  "on_hold",
  "approved",
  "rejected",
  "cancelled",
];

export function AdminPointChargeFilterBar({
  filters,
  onChange,
}: AdminPointChargeFilterBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.requestStatus}
        onChange={(e) =>
          onChange({
            ...filters,
            requestStatus: e.target.value as AdminPointChargeFilters["requestStatus"],
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        <option value="">{t("common_all")}</option>
        {STATUS_VALUES.map((status) => (
          <option key={status} value={status}>
            {pointChargeStatusLabel(t, status)}
          </option>
        ))}
      </select>
    </div>
  );
}
