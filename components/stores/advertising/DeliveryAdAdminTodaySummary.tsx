"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_ADMIN_HUB_CONTRACT } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

type Props = {
  counts: Record<(typeof DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryBuckets)[number]["id"], number>;
};

/** Design board Admin hub — 오늘 요약 4-card row */
export function DeliveryAdAdminTodaySummary({ counts }: Props) {
  const { t } = useI18n();
  return (
    <section data-admin-delivery-ads-section="today-summary">
      <h2 className="mb-2 text-[14px] font-bold text-sam-fg">
        {t(DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryKey)}
      </h2>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        data-admin-delivery-ads-today-summary="design-board"
      >
        {DELIVERY_AD_ADMIN_HUB_CONTRACT.todaySummaryBuckets.map(({ id, labelKey }) => (
          <div
            key={id}
            className="rounded-ui-rect border border-[#BDBDBD] bg-white p-3 shadow-sm"
            data-admin-today-bucket={id}
          >
            <p className="text-[22px] font-bold tabular-nums text-[#0A823E]">{counts[id]}</p>
            <p className="mt-0.5 text-[12px] font-medium text-[#757575]">{t(labelKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
