"use client";

import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";

/** 배달 홈·업종 browse — 목록 영역 버퍼링(텍스트 없음) */
export function StoreDeliveryListLoading({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex min-h-[11rem] items-center justify-center py-10 ${className}`}
      aria-busy="true"
    >
      <StoreDeliveryBufferingSpinner />
    </div>
  );
}
