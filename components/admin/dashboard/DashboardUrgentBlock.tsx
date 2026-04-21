"use client";

import Link from "next/link";

const URGENT_LINKS: { href: string; label: string }[] = [
  { href: "/admin/reports", label: "신고 대기" },
  { href: "/admin/point-charges", label: "충전 승인 대기" },
  { href: "/admin/reports", label: "블라인드 검토" },
  { href: "/admin/feed-emergency", label: "피드 장애" },
  { href: "/admin/system", label: "시스템 경고" },
];

export function DashboardUrgentBlock() {
  return (
    <div className="rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4">
      <h2 className="mb-3 sam-text-body-secondary font-medium text-amber-800">
        긴급 처리
      </h2>
      <ul className="flex flex-wrap gap-2">
        {URGENT_LINKS.map(({ href, label }) => (
          <li key={label + href}>
            <Link
              href={href}
              className="inline-block rounded border border-amber-300 bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-amber-800 hover:bg-amber-100"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
