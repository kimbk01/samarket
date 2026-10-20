"use client";

import type { OverviewMetric } from "@/lib/admin-users/member-overview-aggregates";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

export function AdminMemberMetricValue({
  metric,
  format,
}: {
  metric: OverviewMetric<number | string | null>;
  format?: (value: number | string | null) => string;
}) {
  const { safeT } = useI18n();
  if (!metric.ok) {
    return (
      <span className="text-sm font-semibold text-sam-danger">
        {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
      </span>
    );
  }
  if (metric.value == null || metric.value === "") {
    return (
      <span className="text-sm font-semibold text-sam-meta">
        {safeT("admin_users_empty_placeholder", { fallbackKo: "—", fallbackEn: "—" })}
      </span>
    );
  }
  return <span className="text-sm font-semibold text-sam-fg">{format ? format(metric.value) : String(metric.value)}</span>;
}

export function AdminMemberMetricGrid({
  items,
}: {
  items: Array<{ label: string; metric: OverviewMetric<number | string | null>; format?: (value: number | string | null) => string }>;
}) {
  return (
    <p className="text-[13px] font-medium text-sam-fg">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? " | " : null}
          {item.label} <AdminMemberMetricValue metric={item.metric} format={item.format} />
        </span>
      ))}
    </p>
  );
}

export function AdminMemberPager({
  page,
  hasNext,
  onPrev,
  onNext,
}: {
  page: number;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <AdminActionButton
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={onPrev}
      >
        {safeT("admin_users_cc_page_prev", { fallbackKo: "이전", fallbackEn: "Prev" })}
      </AdminActionButton>
      <span className="text-xs text-sam-muted">{page}</span>
      <AdminActionButton
        variant="secondary"
        size="sm"
        disabled={!hasNext}
        onClick={onNext}
      >
        {safeT("admin_users_cc_page_next", { fallbackKo: "다음", fallbackEn: "Next" })}
      </AdminActionButton>
    </div>
  );
}
