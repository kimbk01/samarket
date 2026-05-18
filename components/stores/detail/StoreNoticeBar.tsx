"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";

/**
 * 사장님 알림 / 매장 공지 슬롯 — 접기·펼치기는 슬롯 내부 컴포넌트가 담당한다.
 */
export function StoreNoticeBar({ legacyStrip, managedSlot }: { legacyStrip?: ReactNode; managedSlot?: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      {legacyStrip}
      {managedSlot ? <div className="mt-2 px-4">{managedSlot}</div> : null}
    </>
  );
}
