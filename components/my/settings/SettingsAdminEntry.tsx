"use client";

import Link from "next/link";

interface SettingsAdminEntryProps {
  /** 플랫폼 관리자 — `/admin` */
  showAdmin: boolean;
  /** 내 매장 소유 — `/my/business` (관리자와 별도) */
  showStoreOwner: boolean;
}

export function SettingsAdminEntry({ showAdmin, showStoreOwner }: SettingsAdminEntryProps) {
  if (!showAdmin && !showStoreOwner) return null;
  return (
    <section className="border-t border-gray-100 bg-white pt-4">
      <div className="divide-y divide-gray-100">
        {showAdmin ? (
          <Link
            href="/admin"
            className="flex items-center justify-between px-4 py-3 text-[15px] font-medium text-signature"
          >
            <span>관리자 접속</span>
            <ChevronRight />
          </Link>
        ) : null}
        {showStoreOwner ? (
          <Link
            href="/my/business"
            className="flex items-center justify-between px-4 py-3 text-[15px] font-medium text-gray-900"
          >
            <span>매장 관리자 접속</span>
            <ChevronRight className="text-gray-400" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function ChevronRight({ className = "text-signature" }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
