"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
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
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref="/my" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
          포인트
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="space-y-6 p-4">
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
