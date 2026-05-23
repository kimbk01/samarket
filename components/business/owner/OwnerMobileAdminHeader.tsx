"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import type { OwnerStoreOpsMeta } from "@/lib/stores/owner-store-ops-snapshot";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerStoreNotificationsHref } from "@/lib/business/owner-store-notifications-route";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { openOwnerMobileOpsMenu } from "@/lib/business/owner-mobile-ops-menu-bridge";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { useOwnerMobileAdminHeaderTrailing } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { BodyPortal } from "@/components/layout/BodyPortal";
import {
  OWNER_MOBILE_EXIT_HREF,
  OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS,
  OWNER_MOBILE_PAGE_HEADER_ROW_CLASS,
  OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS,
} from "@/lib/stores/owner-mobile-ui-tokens";

const HEADER_ICON_BTN_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-[#262626] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]";

function OwnerMenuIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/**
 * 매장 오너 모바일 공통 상단 헤더 — 허브·주문·정산 등 `/stores/owner/*` 전역.
 * `BusinessAdminShell` 에서만 마운트한다.
 *
 * `BodyPortal` — `AppRouteTransition` transform 조상 밖(document.body)에 고정.
 * (`components/layout/BodyPortal.tsx` · `StoresOwnerStackHeader` 와 동일 이유)
 */
export function OwnerMobileAdminHeader({
  variant,
  storeName,
  storeId,
  storeSlug,
  storeOps,
  urgentAlertCount,
  stores,
  pageTitle,
  backHref,
  backIntercept,
  exitHref = OWNER_MOBILE_EXIT_HREF,
}: {
  variant: "hub" | "page";
  storeName: string;
  storeId: string;
  storeSlug?: string | null;
  storeOps: OwnerStoreOpsMeta;
  urgentAlertCount: number;
  stores?: StoreRow[] | null;
  pageTitle?: string | null;
  backHref?: string;
  /** true면 뒤로·폴백 이동 차단(미저장 이탈·카테고리 편집 등) */
  backIntercept?: () => boolean;
  /** 허브 「나가기」— 소비자 배달 홈 (`/stores`) */
  exitHref?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubRuntime = useOwnerHubRuntime();
  const biz = useBusinessAdminStore();
  const trailingCtx = useOwnerMobileAdminHeaderTrailing();

  const onOpenOpsMenu = () => {
    if (openOwnerMobileOpsMenu()) return;
    biz?.openMobileOwnerMenu?.();
  };
  const storeList = stores ?? hubRuntime?.stores ?? null;
  const notificationsHref =
    resolveOwnerStoreNotificationsHref({ slug: storeSlug }) ?? OwnerRoutes.settings(storeId);
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
    <BodyPortal>
    <header
      className={OWNER_MOBILE_PAGE_HEADER_SHELL_CLASS}
      aria-label={
        variant === "hub" ? t("store_owner_aria_store_ops") : pageTitle ?? t("owner_store_admin_hub")
      }
    >
      <div className={OWNER_MOBILE_PAGE_HEADER_ROW_CLASS}>
        {variant === "hub" ? (
          <>
            <AppBackButton
              backHref={exitHref}
              preferHistoryBack
              interceptBack={backIntercept}
              className={`${HEADER_ICON_BTN_CLASS} text-[#1C8DB8] hover:bg-[#E8F1FF] active:bg-[#DBEDF5]`}
              iconClassName="h-5 w-5 shrink-0"
              ariaLabel={t("store_owner_aria_exit_delivery_home")}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-[1pt] overflow-hidden">
              <div className="flex min-w-0 items-center gap-1">
                {storeList && storeList.length > 1 ? (
                  <label className="relative flex min-w-0 max-w-full flex-1 items-center">
                    <span className="sr-only">{t("store_owner_aria_select_store")}</span>
                    <select
                      className="max-w-full min-w-0 cursor-pointer appearance-none truncate border-0 bg-transparent pr-4 text-[14px] font-bold leading-none text-[#262626] focus:outline-none"
                      value={storeId}
                      onChange={(e) => onStoreChange(e.target.value)}
                    >
                      {storeList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.store_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8C8C8C]"
                      aria-hidden
                    />
                  </label>
                ) : (
                  <p className="min-w-0 truncate text-[14px] font-bold leading-none text-[#262626]">
                    {storeName}
                  </p>
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
              <p className="truncate text-[10px] leading-none text-[#8C8C8C]">
                {[storeOps.hours_label, prep].filter(Boolean).join(" · ") || t("store_owner_ops_set_hours")}
              </p>
            </div>
          </>
        ) : (
          <>
            {backHref ? (
              <AppBackButton
                backHref={backHref}
                preferHistoryBack
                interceptBack={backIntercept}
                className={HEADER_ICON_BTN_CLASS}
                iconClassName="h-5 w-5"
                ariaLabel={t("store_owner_aria_dashboard")}
              />
            ) : (
              <span className="w-0" aria-hidden />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden pr-1">
              <h1 className="truncate text-[14px] font-bold leading-none text-[#262626]">
                {pageTitle?.trim() || t("owner_store_admin_hub")}
              </h1>
            </div>
          </>
        )}

        <div className={OWNER_MOBILE_PAGE_HEADER_ACTIONS_CLASS}>
          {trailingCtx?.trailing}
          <Link
            href={notificationsHref}
            className={`relative ${HEADER_ICON_BTN_CLASS}`}
            aria-label={t("store_owner_aria_notifications", { count: String(urgentAlertCount) })}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {urgentAlertCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF4D4F] px-1 text-[10px] font-bold leading-none text-white">
                {urgentAlertCount > 99 ? "99+" : urgentAlertCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className={`relative z-10 ${HEADER_ICON_BTN_CLASS}`}
            aria-label={t("store_owner_aria_open_menu")}
            aria-haspopup="dialog"
            onClick={onOpenOpsMenu}
          >
            <OwnerMenuIcon />
          </button>
        </div>
      </div>
    </header>
    </BodyPortal>
  );
}
