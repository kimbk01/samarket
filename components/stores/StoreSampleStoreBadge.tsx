"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 묶음3-A S-03 — 「샘플 매장 · 실제 주문 불가」 배지 (홈 피드·업종 목록·검색·매장 상세 공용 1컴포넌트).
 * 샘플 판정은 공개 응답의 `isSampleStore`(서버가 `stores.store_kind='sample'` 로 계산)만 쓴다.
 */
export function StoreSampleStoreBadge({
  isSampleStore,
  className = "",
}: {
  isSampleStore: boolean | null | undefined;
  className?: string;
}) {
  const { t } = useI18n();
  if (isSampleStore !== true) return null;
  return (
    <span
      data-store-sample-badge="1"
      className={[Sam.badge.warning, "shrink-0 whitespace-nowrap", className].filter(Boolean).join(" ")}
    >
      {t("store_sample_store_badge")}
    </span>
  );
}
