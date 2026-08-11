"use client";

import type { OverviewMetric } from "@/lib/admin-users/member-overview-aggregates";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
      <span className="text-sm font-semibold text-[#b42318]">
        {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
      </span>
    );
  }
  if (metric.value == null || metric.value === "") {
    return (
      <span className="text-sm font-semibold text-[#98a2b3]">
        {safeT("admin_users_empty_placeholder", { fallbackKo: "—", fallbackEn: "—" })}
      </span>
    );
  }
  return <span className="text-sm font-semibold text-[#101828]">{format ? format(metric.value) : String(metric.value)}</span>;
}

export function AdminMemberMetricGrid({
  items,
}: {
  items: Array<{ label: string; metric: OverviewMetric<number | string | null>; format?: (value: number | string | null) => string }>;
}) {
  return (
    <p className="text-[13px] font-medium text-[#344054]">
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
      <button
        type="button"
        disabled={page <= 1}
        onClick={onPrev}
        className="rounded-md border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold text-[#344054] disabled:opacity-40"
      >
        {safeT("admin_users_cc_page_prev", { fallbackKo: "이전", fallbackEn: "Prev" })}
      </button>
      <span className="text-xs text-[#667085]">{page}</span>
      <button
        type="button"
        disabled={!hasNext}
        onClick={onNext}
        className="rounded-md border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold text-[#344054] disabled:opacity-40"
      >
        {safeT("admin_users_cc_page_next", { fallbackKo: "다음", fallbackEn: "Next" })}
      </button>
    </div>
  );
}
