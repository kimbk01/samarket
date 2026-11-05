"use client";

import { FinanceStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { pointChargeStatusDisplay } from "@/lib/finance/finance-display-labels";
import type { PointChargeRequestStatus } from "@/lib/types/point";

/** 관리자 Point 충전 목록 배지 — 회원 화면과 같은 상태 이름 (금융 SSOT) */
export function PointChargeBadge({ status }: { status: PointChargeRequestStatus }) {
  return <FinanceStatusBadge label={pointChargeStatusDisplay(status)} fallback={status} />;
}
