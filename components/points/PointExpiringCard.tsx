"use client";

import Link from "next/link";
import type { PointExpireUpcomingSummary } from "@/lib/types/point-expire";

interface PointExpiringCardProps {
  summary: PointExpireUpcomingSummary;
  className?: string;
}

export function PointExpiringCard({ summary, className = "" }: PointExpiringCardProps) {
  if (summary.totalExpiringPoint <= 0) return null;

  return (
    <Link
      href="/my/points/expiring"
      className={`block rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4 ${className}`}
    >
      <p className="text-[13px] text-amber-800">만료 예정 포인트</p>
      <p className="mt-1 text-[20px] font-bold text-amber-900">
        {summary.totalExpiringPoint.toLocaleString()}P
      </p>
      {summary.nearestExpireAt && (
        <p className="mt-1 text-[12px] text-amber-700">
          가장 빠른 만료:{" "}
          {new Date(summary.nearestExpireAt).toLocaleDateString("ko-KR")}
        </p>
      )}
      <p className="mt-2 text-[12px] text-amber-600">자세히 보기 →</p>
    </Link>
  );
}
