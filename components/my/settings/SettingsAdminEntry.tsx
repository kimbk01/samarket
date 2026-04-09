"use client";

import Link from "next/link";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";

interface SettingsAdminEntryProps {
  /** 플랫폼 관리자 — `/admin` */
  showAdmin: boolean;
  /** 내 매장 소유 — `/my/business` (관리자와 별도) */
  showStoreOwner: boolean;
}

export function SettingsAdminEntry({ showAdmin, showStoreOwner }: SettingsAdminEntryProps) {
  const { goBusinessHubOrModal, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
  if (!showAdmin && !showStoreOwner) return null;
  return (
    <section className="mt-6 rounded-ui-rect bg-white px-4 py-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-[13px] font-medium text-gray-500">보조 바로가기</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          운영 기능이 필요할 때만 여는 보조 진입입니다. 주문과 매장 운영 흐름은 매장 메뉴에서 이어집니다.
        </p>
      </div>
      <div className="divide-y divide-gray-100 rounded-ui-rect border border-gray-100">
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
          <button
            type="button"
            onClick={() => goBusinessHubOrModal("/my/business")}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-medium text-gray-900"
          >
            <span>매장 관리자 접속</span>
            <ChevronRight className="text-gray-400" />
          </button>
        ) : null}
      </div>
      {hubBlockedModal}
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
