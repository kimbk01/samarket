"use client";

import Link from "next/link";

const ITEMS: { label: string; href: string; icon: React.ReactNode }[] = [
  { label: "매장 등록 신청", href: "/my/business/apply", icon: <BuildingIcon /> },
  { label: "매장 관리 (승인 후)", href: "/my/business", icon: <StoreManageIcon /> },
  { label: "광고", href: "/my/ads", icon: <MegaphoneIcon /> },
];

export function MyBusinessSection() {
  return (
    <section className="rounded-xl border border-ig-border bg-white p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-muted">나의 비즈니스</h2>
      <ul className="space-y-0">
        {ITEMS.map((item, i) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex items-center gap-3 py-3 text-[14px] text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center text-gray-500">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              <ChevronRight />
            </Link>
            {i < ITEMS.length - 1 && <hr className="border-ig-border" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BuildingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function StoreManageIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13a3 3 0 001.17-5.764m.5-3.228a3 3 0 00-5.614-.614" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
