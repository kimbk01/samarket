"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";

/**
 * 매장 상단: 스티키 앱바 + 히어로 요약.
 * 로직·데이터는 부모(`StoreDetailSummarySection`)에서 준비하고 슬롯만 전달한다.
 */
export function StoreHeader({ sticky, hero }: { sticky: ReactNode; hero: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      {sticky}
      <div>{hero}</div>
    </>
  );
}
