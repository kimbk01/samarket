"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_STORE_STATUS_FILTER,
} from "@/components/admin/stores/admin-store-review-model";

export type AdminBusinessListFilters = {
  status: string;
  q: string;
};

interface AdminBusinessFilterBarProps {
  filters: AdminBusinessListFilters;
  onChange: (f: AdminBusinessListFilters) => void;
  resultCount?: number;
  loading?: boolean;
}

export function AdminBusinessFilterBar({
  filters,
  onChange,
  resultCount,
  loading,
}: AdminBusinessFilterBarProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
      <div className="flex flex-wrap gap-1.5">
        {ADMIN_STORE_STATUS_FILTER.map((f) => {
          const active = filters.status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => onChange({ ...filters, status: f.value })}
              className={`rounded border px-2.5 py-1.5 sam-text-helper font-medium transition ${
                active
                  ? "border-signature bg-signature text-white"
                  : "border-sam-border bg-sam-app text-sam-fg hover:bg-sam-surface-muted"
              }`}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>
      <div>
        <input
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder={t("admin_biz_search_ph")}
          className="w-full max-w-xl rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg outline-none focus:border-signature"
        />
        <p className="mt-2 sam-text-helper text-sam-muted">
          {loading
            ? t("common_loading")
            : typeof resultCount === "number"
              ? t("admin_biz_result_count", { count: resultCount })
              : null}
        </p>
      </div>
    </div>
  );
}
