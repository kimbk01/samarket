"use client";

import { useMemo } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointLedgerList } from "@/components/points/PointLedgerList";
import type { PointLedgerEntry } from "@/lib/types/point";

export default function MyPointsLedgerPage() {
  const balance = 0;
  const entries = useMemo<PointLedgerEntry[]>(() => [], []);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="포인트 거래내역"
        subtitle="적립·사용 내역"
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          실제 거래내역은 포인트 API 연동 후 표시됩니다.
        </div>
        <PointBalanceCard balance={balance} />
        <PointLedgerList entries={entries} />
      </div>
    </div>
  );
}
