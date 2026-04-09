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
      <div className="flex items-center justify-between rounded-xl border border-ig-border bg-white px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-signature/10">
            <span className="text-[14px] font-bold text-signature">P</span>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted">내 포인트</p>
            <p className="text-[17px] font-bold text-foreground">
              {balance === null ? "…" : `${balance.toLocaleString()}P`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-lg bg-signature px-3 py-1.5 text-[12px] font-semibold text-white">
            충전 신청
          </span>
          <span className="text-muted">›</span>
        </div>
      </div>
    </Link>
  );
}
