"use client";

import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";

/** 매장 관리 화면 Suspense 대기 — 예전 「불러오는 중…」 글자 → DIBAY 대기 스피너(loading-spinner 설계 §3-1) */
export function OwnerStoreSuspenseFallback({ className }: { className?: string }) {
  return <DibayPendingSpinner layout="block" className={className ?? ""} />;
}
