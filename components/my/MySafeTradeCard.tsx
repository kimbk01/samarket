"use client";

import Link from "next/link";

/**
 * 안전거래/결제 유도 카드 (당근페이 느낌)
 * 실제 결제·안전거래 페이지 연결 가능
 */
export function MySafeTradeCard() {
  return (
    <Link
      href="/my/points"
      className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
    >
      <div>
        <p className="text-[15px] font-semibold text-gray-900">안전한 거래</p>
        <p className="mt-0.5 text-[13px] text-gray-500">
          포인트 충전 및 결제
        </p>
      </div>
      <span className="text-gray-400">
        <ChevronIcon />
      </span>
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
