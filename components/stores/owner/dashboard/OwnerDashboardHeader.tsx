"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsMeta } from "@/lib/stores/owner-store-ops-snapshot";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import {
  OWNER_MOBILE_PAGE_HEADER_ROW_CLASS,
  OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS,
  OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";
import { cn } from "./owner-dashboard-ui";

function OwnerMenuIcon() {
  return (
    <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function OwnerDashboardHeader({
  storeName,
  storeId,
  storeOps,
  urgentAlertCount: _urgentAlertCount,
  stores,
}: {
  storeName: string;
  storeId: string;
  storeSlug?: string | null;
  storeOps: OwnerStoreOpsMeta;
  urgentAlertCount: number;
  stores?: StoreRow[] | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubRuntime = useOwnerHubRuntime();
  const biz = useBusinessAdminStore();
  const storeList = stores ?? hubRuntime?.stores ?? null;
  const open = storeOps.is_open;
  const prep =
    storeOps.prep_minutes != null && storeOps.prep_minutes > 0
      ? t("store_owner_ops_prep_minutes", { minutes: String(storeOps.prep_minutes) })
      : null;

  const onStoreChange = (nextId: string) => {
    const sid = nextId.trim();
    if (!sid || sid === storeId) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("storeId", sid);
    router.push(`/stores/owner?${p.toString()}`);
  };

  return (
    <header
      className={cn(
        OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS,
        OWNER_MOBILE_PAGE_HEADER_SHELL_BLEED_CLASS
      )}
      aria-label={t("store_owner_aria_store_ops")}
    >
      <div className={OWNER_MOBILE_PAGE_HEADER_ROW_CLASS}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0">
          <div className="flex min-w-0 items-center gap-1">
            {storeList && storeList.length > 1 ? (
              <label className="relative flex min-w-0 max-w-[55%] items-center">
                <span className="sr-only">{t("store_owner_aria_select_store")}</span>
                <select
                  className="max-w-full cursor-pointer appearance-none truncate border-0 bg-transparent pr-4 text-[15px] font-bold leading-tight text-[#262626] focus:outline-none"
                  value={storeId}
                  onChange={(e) => onStoreChange(e.target.value)}
                >
                  {storeList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.store_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8C8C8C]" aria-hidden />
              </label>
            ) : (
              <p className="truncate text-[15px] font-bold leading-tight text-[#262626]">{storeName}</p>
            )}
            {(!storeList || storeList.length <= 1) && (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8C8C8C]" aria-hidden />
            )}
            <span
              className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold leading-none ${
                open ? "bg-[#52C41A] text-white" : "bg-[#8C8C8C] text-white"
              }`}
            >
              {open ? t("store_owner_ops_open") : t("store_owner_ops_paused")}
            </span>
          </div>
          <p className="truncate text-[11px] leading-tight text-[#8C8C8C]">
            {[storeOps.hours_label, prep].filter(Boolean).join(" · ") || t("store_owner_ops_set_hours")}
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          <Tier1NotificationAnchor surface="owner_commerce_inbox" storeId={storeId} />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]"
            aria-label={t("store_owner_aria_open_menu")}
            onClick={() => biz?.openMobileOwnerMenu?.()}
          >
            <OwnerMenuIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
