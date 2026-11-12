"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  StoresConsumerHeaderActions,
  StoresConsumerSearchIcon,
} from "@/components/stores/home/hub/StoresConsumerHeaderActions";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { buildDeliveryAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { openGlobalSearchFromHere } from "@/lib/search/global/global-search-navigation-ssot";
import { STORES_HOME_HEADER_ACTIONS_CLUSTER } from "@/lib/design/stores-home-header-chrome";
import { MIRROR_HEADER_SHELL_CLASS } from "@/lib/design/delivery-browse-chrome";
import { useStoresHomeHeaderCollapsed } from "@/lib/stores/use-stores-home-header-collapsed";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { storesHomePtrStore } from "@/lib/stores/stores-home-pull-refresh-store";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <path d="M1.5 3h7L5 7.5z" />
    </svg>
  );
}


/**
 * CONTRACT — `/stores` 배달 메뉴 구성 고정 헤더 (설계 v6 §3 ①②) + 당김 새로고침 힌트.
 * ① 「주소 ▾」 제목과 같은 17px/600 · 헤더 아이콘 주문·카트·알림 48/24 (헤더 SSOT 2단계) — 스크롤하면 접힘
 *   (Owner 2026-11-13: 바로 아래 ② 검색창과 겹치므로 헤더 🔍 제거 — 2026-10-30 「공통 아이콘 그대로」를 이 화면만 대체)
 * ② 검색창 알약 43px · 테두리 1.5px 녹색 — 누르면 배달 검색
 * PTR 슬롯은 헤더 맨 아래 그대로 (`DibayPtrSlot`).
 * DO NOT: `store_address_manage_link` 를 버튼 라벨로 — `resolveDeliveryHomeHeaderButtonLabel` 만.
 */
export function StoresHomeHeaderChrome() {
  const { t, language } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const router = useRouter();
  const pathname = usePathname() ?? "/stores";
  const searchParams = useSearchParams();
  const isStoresHubRoot = useMainHubPtrDomain() === "stores";
  const collapsed = useStoresHomeHeaderCollapsed(isStoresHubRoot);
  const headerLine = useMemo(
    () => resolveDeliveryHomeHeaderButtonLabel(address, language),
    [address, language],
  );
  return (
    <header data-stores-home-header data-delivery-chrome="1" className={`${MIRROR_HEADER_SHELL_CLASS} z-[3]`}>
      <div className="mx-auto w-full min-w-0 max-w-[768px] sector-header--no-left-slot">
        <div
          data-stores-home-address-row
          data-collapsed={collapsed ? "true" : "false"}
          aria-hidden={collapsed}
          className={`overflow-hidden ${collapsed ? "h-0" : "h-[length:var(--sector-header-h)]"}`}
        >
          {/* 헤더 SSOT 2단계 — 다른 허브와 같은 줄(높이 52 · 주소 시작 16px · 아이콘 48/24 · 끝 아이콘 그림 = 화면 끝 16px) */}
          <div className="sector-header-bar sector-header-bar--left-title">
            <button
              type="button"
              className="inline-flex min-w-0 max-w-full items-center gap-1 justify-self-start text-[length:var(--sector-header-title-size)] font-semibold leading-none text-[color:var(--sector-header-title-color)] active:opacity-70"
              aria-label={t("layout_neighborhood_address_aria", { line: headerLine })}
              tabIndex={collapsed ? -1 : 0}
              onClick={() =>
                router.push(
                  buildDeliveryAddressesHrefFromPath(
                    pathname,
                    searchParams?.toString() ? `?${searchParams.toString()}` : "",
                  ),
                )
              }
            >
              <AddressKindHeadPin kind="master" className="h-[18px] w-[18px] shrink-0 [&_svg]:h-full [&_svg]:w-full" />
              <span className="truncate">{headerLine}</span>
              <CaretDownIcon className="h-3.5 w-3.5 shrink-0" />
            </button>
            <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} h-full self-stretch`}>
              <StoresConsumerHeaderActions hideSearch />
            </div>
          </div>
        </div>
        <div className="px-[var(--delivery-page-x)] pb-2 pt-1">
          <button
            type="button"
            data-stores-home-search
            data-global-search-open="delivery"
            className="flex h-[43px] w-full items-center justify-between rounded-full border-[1.5px] border-[color:#0B421A] bg-white pl-4 pr-3 text-left active:bg-[#F3F5F7]"
            onClick={() => openGlobalSearchFromHere(router, { domain: "delivery" })}
          >
            <span className="truncate text-[15px] text-[color:#7E8082]">{t("store_home_search_placeholder")}</span>
            <span className="inline-flex h-[22px] w-[22px] text-[color:var(--sector-header-icon-color,#243832)] [&_svg]:h-full [&_svg]:w-full">
              <StoresConsumerSearchIcon />
            </span>
          </button>
        </div>
        {/* PTR — 헤더 안에서만 확장. UI SSOT: `DibayPtrSlot` */}
        <DibayPtrSlot store={storesHomePtrStore} tone="onSurface" dataAttribute="data-stores-home-ptr-hint" />
      </div>
    </header>
  );
}
