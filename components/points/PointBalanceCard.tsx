"use client";

interface PointBalanceCardProps {
  balance: number;
  className?: string;
}

export function PointBalanceCard({ balance, className = "" }: PointBalanceCardProps) {
  return (
    <div
      className={`rounded-ui-rect border border-sam-border bg-sam-surface p-4 ${className}`}
    >
      <p className="sam-text-body-secondary text-sam-muted">보유 포인트</p>
      <p className="mt-1 sam-text-hero font-bold text-sam-fg">
        {balance.toLocaleString()}P
      </p>
    </div>
  );
}
