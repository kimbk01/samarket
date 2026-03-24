"use client";

import { useMemo } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointLedgerList } from "@/components/points/PointLedgerList";
import type { PointLedgerEntry } from "@/lib/types/point";

export default function MyPointsLedgerPage() {
  const balance = 0;
  const entries = useMemo<PointLedgerEntry[]>(() => [], []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my/points" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          포인트 거래내역
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          실제 거래내역은 포인트 API 연동 후 표시됩니다.
        </div>
        <PointBalanceCard balance={balance} />
        <PointLedgerList entries={entries} />
      </div>
    </div>
  );
}
