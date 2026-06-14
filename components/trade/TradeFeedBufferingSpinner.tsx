"use client";

import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";

/** 거래 피드·주제 전환 로딩 — 12점 링 시계방향 버퍼링(문구 없음, aria는 배달 스피너와 동일) */
export function TradeFeedBufferingSpinner({ className = "" }: { className?: string }) {
  return <StoreDeliveryBufferingSpinner className={className} />;
}
