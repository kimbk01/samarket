"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronDown, Settings } from "lucide-react";
import type { OwnerStoreOpsMeta } from "@/lib/stores/owner-store-ops-snapshot";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerStoreNotificationsHref } from "@/lib/business/owner-store-notifications-route";
import { ownerDashCardClass, ownerDashTypography } from "./owner-dashboard-ui";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";

export function OwnerDashboardHeader({
  storeName,
  storeId,
  storeSlug,
  storeOps,
  urgentAlertCount,
  stores,
}: {
  storeName: string;
  storeId: string;
  storeSlug?: string | null;
  storeOps: OwnerStoreOpsMeta;
  urgentAlertCount: number;
  stores?: StoreRow[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubRuntime = useOwnerHubRuntime();
  const storeList = stores ?? hubRuntime?.stores ?? null;
  const settingsHref = OwnerRoutes.settings(storeId);
  const notificationsHref =
    resolveOwnerStoreNotificationsHref({ slug: storeSlug }) ?? OwnerRoutes.settings(storeId);
  const open = storeOps.is_open;
  const prep =
    storeOps.prep_minutes != null && storeOps.prep_minutes > 0
      ? `예상조리 ${storeOps.prep_minutes}분`
      : null;

  const onStoreChange = (nextId: string) => {
    const sid = nextId.trim();
    if (!sid || sid === storeId) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set("storeId", sid);
    router.push(`/stores/owner?${p.toString()}`);
  };

  return (
    <header className={ownerDashCardClass("px-3 py-2.5")} aria-label="매장 운영 상태">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex shrink-0 items-center rounded-[4px] px-2 py-0.5 text-[11px] font-bold ${
                open ? "bg-emerald-500 text-white" : "bg-gray-400 text-white"
              }`}
            >
              {open ? "영업중" : "일시중지"}
            </span>
            {storeList && storeList.length > 1 ? (
              <label className="relative flex min-w-0 flex-1 items-center gap-0.5">
                <span className="sr-only">매장 선택</span>
                <select
                  className={`max-w-full cursor-pointer appearance-none truncate border-0 bg-transparent pr-5 ${ownerDashTypography.sectionTitle} focus:outline-none focus:ring-0`}
                  value={storeId}
                  onChange={(e) => onStoreChange(e.target.value)}
                >
                  {storeList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.store_name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              </label>
            ) : (
              <p className={`truncate ${ownerDashTypography.sectionTitle}`}>{storeName}</p>
            )}
            {(!storeList || storeList.length <= 1) && (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            )}
          </div>
          <p className={`mt-1 ${ownerDashTypography.helper}`}>
            {[storeOps.hours_label, prep].filter(Boolean).join(" · ") || "영업 시간을 설정해 주세요"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={notificationsHref}
            className="relative flex h-11 w-11 items-center justify-center rounded-[4px] text-gray-700 hover:bg-gray-50"
            aria-label={`알림 ${urgentAlertCount}건`}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {urgentAlertCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold leading-none text-white">
                {urgentAlertCount > 99 ? "99+" : urgentAlertCount}
              </span>
            ) : null}
          </Link>
          <Link
            href={settingsHref}
            className="flex h-11 w-11 items-center justify-center rounded-[4px] text-gray-700 hover:bg-gray-50"
            aria-label="매장 설정"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
