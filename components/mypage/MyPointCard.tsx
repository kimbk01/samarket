"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function MyPointCard() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/me/points", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { balance?: number }) => {
        if (typeof j.balance === "number") setBalance(j.balance);
      })
      .catch(() => {});
  }, []);

  return (
    <Link href="/mypage/points" className="block">
      <div className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-signature/10">
            <span className="sam-text-body font-bold text-signature">P</span>
          </div>
          <div>
            <p className="sam-text-xxs font-medium text-muted">내 포인트</p>
            <p className="sam-text-section-title font-bold text-foreground">
              {balance === null ? "…" : `${balance.toLocaleString()}P`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-semibold text-white">
            충전 신청
          </span>
          <span className="text-muted">›</span>
        </div>
      </div>
    </Link>
  );
}
