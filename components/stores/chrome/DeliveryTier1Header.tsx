"use client";

import type { ReactNode } from "react";
import {
  DELIVERY_CONSUMER_HEADER_BAR_CLASS,
  DELIVERY_CONSUMER_HEADER_ROW_CLASS,
  DELIVERY_TIER1_HEADER_INNER_CLASS,
} from "@/lib/design/delivery-chrome";
import { DeliveryConsumerHeaderRow } from "@/components/stores/chrome/DeliveryConsumerHeaderRow";

/**
 * `/stores` 루트 1단 — 배민식 세그먼트 제목(배달) + 우측 액션.
 * 레이아웃은 browse·매장 고정 헤더와 동일(`DeliveryConsumerHeaderRow`).
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
          <DeliveryConsumerHeaderRow title={title} trailing={trailing} />
        </div>
      </div>
    </header>
  );
}
