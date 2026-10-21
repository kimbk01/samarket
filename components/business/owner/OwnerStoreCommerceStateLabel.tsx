"use client";

import { useEffect, useState } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";

/** 분 단위로 다시 그려 스케줄 경계(영업 시작·휴게·마감)를 따라간다. */
export function useOwnerMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * OPS-04 — 오너가 보는 실효 영업 상태(영업중/휴게중/영업시간 외/오늘 휴무/수동 마감).
 * 주문자·관리자와 같은 `resolveStoreFrontCommerceState` 결과. 토글(`is_open`)은 수동 플래그일 뿐이다.
 */
export function OwnerStoreCommerceStateLabel({
  row,
  className = "",
}: {
  row: Pick<StoreRow, "business_hours_json" | "is_open">;
  className?: string;
}) {
  const { t } = useI18n();
  const now = useOwnerMinuteNow();
  const st = resolveOwnerStoreCommerceStateLabel(row, now);
  const tone = st.isOpenForCommerce
    ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
    : "border-sam-border bg-sam-app text-sam-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone} ${className}`}
      data-owner-store-commerce-state={st.reason}
      title={t("business_ops3b_effective_state", { state: t(st.labelKey) })}
    >
      {t(st.labelKey)}
    </span>
  );
}
