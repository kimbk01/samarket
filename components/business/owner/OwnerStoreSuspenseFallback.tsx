"use client";

import { MypageRouteLoading } from "@/components/mypage/i18n/MypageRouteLoading";

export function OwnerStoreSuspenseFallback({ className }: { className?: string }) {
  return <MypageRouteLoading className={className ?? "sam-text-body text-sam-muted"} />;
}
