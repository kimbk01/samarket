"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { Bell, Filter, Search } from "lucide-react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { resolveOwnerStoreNotificationsHref } from "@/lib/business/owner-store-notifications-route";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { openOwnerMobileOpsMenu } from "@/lib/business/owner-mobile-ops-menu-bridge";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS,
  OWNER_MOBILE_PAGE_HEADER_ROW_CLASS,
  OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS,
  OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";

function OwnerMenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function OwnerOrdersPageHeader({
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
  const { t } = useI18n();
  const biz = useBusinessAdminStore();
  const onOpenOpsMenu = () => {
    if (openOwnerMobileOpsMenu()) return;
    biz?.openMobileOwnerMenu?.();
  };
  const notificationsHref =
    resolveOwnerStoreNotificationsHref(storeRow) ??
    `/stores/owner/settings?storeId=${encodeURIComponent(storeRow?.id ?? "")}`;

  return (
    <header
      className={`${OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS} ${OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS}`}
    >
      <div className={OWNER_MOBILE_PAGE_HEADER_ROW_CLASS}>
        <AppBackButton
          backHref={backHref}
          preferHistoryBack
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          iconClassName="h-5 w-5"
          ariaLabel={t("store_owner_aria_dashboard")}
        />
        <div className="min-w-0 flex-1 overflow-hidden pr-1">
          <h1 className="truncate text-[14px] font-bold leading-none text-[#262626]">
            {t("store_owner_go_order_management")}
          </h1>
        </div>
        <div className={OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS}>
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label={t("store_owner_mobile_aria_search")}
          >
            <Search className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onOpenFilter}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label={t("store_owner_mobile_aria_filter")}
          >
            <Filter className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <Link
            href={notificationsHref}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
            aria-label={t("store_owner_aria_notifications", { count: String(bellCount) })}
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
            className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]"
            aria-label={t("store_owner_aria_open_menu")}
            aria-haspopup="dialog"
            onClick={onOpenOpsMenu}
          >
            <OwnerMenuIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
