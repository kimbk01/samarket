"use client";

import type { ReactNode } from "react";
import {
  DELIVERY_CONSUMER_HEADER_BAR_CLASS,
  DELIVERY_CONSUMER_HEADER_ROW_CLASS,
  DELIVERY_CONSUMER_HEADER_TITLE_CLASS,
  DELIVERY_TIER1_HEADER_INNER_CLASS,
} from "@/lib/design/delivery-chrome";

/**
 * `/stores` 루트 1단 — 배민식 좌측 세그먼트 제목(배달) + 우측 액션.
 * 높이·타이포는 `DeliverySubpageHeader`·매장 고정 헤더와 동일(48px / 17px bold).
 */
export function DeliveryTier1Header({
  title,
  trailing,
}: {
  title: string;
  trailing: ReactNode;
}) {
  return (
    <header className={`delivery-ui ${DELIVERY_CONSUMER_HEADER_BAR_CLASS}`}>
      <div className={DELIVERY_TIER1_HEADER_INNER_CLASS}>
        <div className={DELIVERY_CONSUMER_HEADER_ROW_CLASS}>
          <h1 className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden text-left">
            <span className={DELIVERY_CONSUMER_HEADER_TITLE_CLASS}>{title}</span>
          </h1>
          <div className="ml-auto flex h-full shrink-0 items-center justify-end">{trailing}</div>
        </div>
      </div>
    </header>
  );
}
