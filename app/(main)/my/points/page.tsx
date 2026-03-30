"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getUpcomingExpiringSummary } from "@/lib/points/point-expire-utils";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { PointChargeRequestList } from "@/components/points/PointChargeRequestList";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";

function PointsBackendNotice() {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      포인트 잔액·내역은 <strong className="font-semibold">DB/API 연동 후</strong> 표시됩니다. 샘플
      데이터는 사용하지 않습니다.
    </div>
  );
}

export default function MyPointsPage() {
  const userId = getCurrentUser()?.id ?? "";
  const balance = 0;
  const ledgerEntries = useMemo<PointLedgerEntry[]>(() => [], []);
  const expiringSummary = useMemo(
    () => ({
      userId,
      ...getUpcomingExpiringSummary(userId, ledgerEntries),
    }),
    [userId, ledgerEntries]
  );
  const requests = useMemo<PointChargeRequest[]>(() => [], []);

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="포인트"
        subtitle="잔액·충전·내역"
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <PointsBackendNotice />
        <PointBalanceCard balance={balance} />
        <PointExpiringCard summary={expiringSummary} />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/my/points/charge"
            className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white"
          >
            충전 신청
          </Link>
          <Link
            href="/my/points/ledger"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            거래내역
          </Link>
          <Link
            href="/my/points/promotions"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            포인트 노출 신청
          </Link>
          <Link
            href="/my/points/expiring"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            만료 예정
          </Link>
        </div>
        <div>
          <h2 className="mb-2 text-[15px] font-semibold text-gray-900">
            충전 신청 내역
          </h2>
          <PointChargeRequestList requests={requests} />
        </div>
      </div>
    </div>
  );
}
