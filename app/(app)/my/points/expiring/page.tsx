"use client";

import { useMemo } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointExpireList } from "@/components/points/PointExpireList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointLedgerEntry } from "@/lib/types/point";

export default function MyPointsExpiringPage() {
  const userId = getCurrentUser()?.id ?? "";
  const balance = 0;
  const entries = useMemo<PointLedgerEntry[]>(() => [], []);
  const summary = useMemo(
    () => ({
      userId,
      ...getUpcomingExpiringSummary(userId, entries),
    }),
    [userId, entries]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/points" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          만료 예정 포인트
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          만료 예정 데이터는 포인트 원장 API 연동 후 표시됩니다.
        </div>
        <PointBalanceCard balance={balance} />
        <PointExpiringCard summary={summary} />
        <PointExpireList expiringEntries={[]} expiredEntries={[]} />
      </div>
    </div>
  );
}
