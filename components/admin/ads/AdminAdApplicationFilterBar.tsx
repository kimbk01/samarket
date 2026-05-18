"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdApplicationStatus } from "@/lib/types/ad-application";
import type { AdminAdApplicationFilters } from "@/lib/ads/ad-utils";
import { AD_APPLICATION_STATUS_FILTER_VALUES } from "@/lib/ads/ad-utils";

const STATUS_OPTION_KEYS: Record<AdApplicationStatus | "", MessageKey> = {
  "": "common_all",
  pending: "admin_ads_app_status_pending",
  waiting_payment: "admin_ads_app_status_waiting_payment",
  approved: "admin_ads_app_status_approved",
  rejected: "admin_ads_app_status_rejected",
  active: "admin_ads_app_status_active",
  expired: "admin_ads_app_status_expired",
  cancelled: "admin_ads_app_status_cancelled",
};

interface AdminAdApplicationFilterBarProps {
  filters: AdminAdApplicationFilters;
  onChange: (f: AdminAdApplicationFilters) => void;
}

export function AdminAdApplicationFilterBar({
  filters,
  onChange,
}: AdminAdApplicationFilterBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={filters.applicationStatus}
        onChange={(e) =>
          onChange({
            ...filters,
            applicationStatus: e.target
              .value as AdminAdApplicationFilters["applicationStatus"],
          })
        }
        className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      >
        {AD_APPLICATION_STATUS_FILTER_VALUES.map((value) => (
          <option key={value || "all"} value={value}>
            {t(STATUS_OPTION_KEYS[value])}
          </option>
        ))}
      </select>
    </div>
  );
}
