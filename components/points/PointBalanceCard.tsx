"use client";

interface PointBalanceCardProps {
  balance: number;
  className?: string;
}

export function PointBalanceCard({ balance, className = "" }: PointBalanceCardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}
    >
      <p className="text-[13px] text-gray-500">보유 포인트</p>
      <p className="mt-1 text-[24px] font-bold text-gray-900">
        {balance.toLocaleString()}P
      </p>
    </div>
  );
}
