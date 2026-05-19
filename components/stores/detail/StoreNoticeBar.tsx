"use client";

import type { ReactNode } from "react";

/**
 * 사장님 알림 / 매장 공지 슬롯 — 접기·펼치기는 슬롯 내부 컴포넌트가 담당한다.
 */
export function StoreNoticeBar({ legacyStrip, managedSlot }: { legacyStrip?: ReactNode; managedSlot?: ReactNode }) {
  return (
    <section id="store-detail-notice-bar">
      {legacyStrip}
      {managedSlot ? <section className="mt-2 px-4">{managedSlot}</section> : null}
    </section>
  );
}
