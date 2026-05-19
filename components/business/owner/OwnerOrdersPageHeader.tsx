"use client";

import Link from "next/link";
import { Bell, ChevronLeft, Filter, Search } from "lucide-react";
import { resolveOwnerStoreNotificationsHref } from "@/lib/business/owner-store-notifications-route";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

function OwnerMenuIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function OwnerOrdersPageHeader({
  storeName,
  storeRow,
  bellCount,
  onOpenSearch,
  onOpenFilter,
  backHref,
}: {
  storeName: string;
  storeRow: Pick<StoreRow, "id" | "slug"> | null;
  bellCount: number;
  onOpenSearch: () => void;
  onOpenFilter: () => void;
  backHref: string;
}) {
  const biz = useBusinessAdminStore();
  const notificationsHref =
    resolveOwnerStoreNotificationsHref(storeRow) ??
    `/stores/owner/settings?storeId=${encodeURIComponent(storeRow?.id ?? "")}`;

  return (
    <header className="shrink-0 border-b border-[#E5E7EB] bg-white pt-[env(safe-area-inset-top,0px)]">
      <div className="flex h-14 items-center gap-1 px-2">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label="메뉴 열기"
          onClick={() => biz?.openMobileOwnerMenu?.()}
        >
          <OwnerMenuIcon />
        </button>
        <Link
          href={backHref}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label="대시보드로"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[17px] font-bold leading-tight text-[#262626]">주문 관리</h1>
          <p className="truncate text-[12px] leading-tight text-[#8C8C8C]">{storeName}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Link
            href={notificationsHref}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label={`알림 ${bellCount}건`}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {bellCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF4D4F] px-1 text-[10px] font-bold text-white">
                {bellCount > 99 ? "99+" : bellCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label="주문 검색"
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onOpenFilter}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label="주문 필터"
          >
            <Filter className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
