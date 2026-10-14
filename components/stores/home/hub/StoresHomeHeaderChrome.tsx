"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresConsumerHeaderActions } from "@/components/stores/home/hub/StoresConsumerHeaderActions";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import {
  STORES_HOME_HEADER_ACTION_ROW_CLASS,
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_ADDRESS_BUTTON_CLASS,
  STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS,
  STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS,
  STORES_HOME_HEADER_ADDRESS_LINE_CLASS,
  STORES_HOME_HEADER_ADDRESS_PIN_CLASS,
  STORES_HOME_HEADER_HOME_ADDRESS_ROW_GRID_CLASS,
  STORES_HOME_HEADER_INNER_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { storesHomePtrStore } from "@/lib/stores/stores-home-pull-refresh-store";
import { DibayPtrSlot } from "@/components/ptr/DibayPtrSlot";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/**
 * CONTRACT — `/stores` 배민형 고정 헤더 + 당김 새로고침 힌트.
 * DO NOT: `store_address_manage_link` 를 버튼 라벨로 — `resolveDeliveryHomeHeaderButtonLabel` 만.
 * CUT-D — header actions = search · orders · cart · bell (`StoresConsumerHeaderActions`).
 */
export function StoresHomeHeaderChrome() {
  const { t, language } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const router = useRouter();
  const pathname = usePathname() ?? "/stores";
  const searchParams = useSearchParams();
  const headerLine = useMemo(
    () => resolveDeliveryHomeHeaderButtonLabel(address, language),
    [address, language],
  );
  return (
    <>
      <header
        data-stores-home-header
        className={`${STORES_HOME_HEADER_SHELL_CLASS} z-[3]`}
      >
        <div className={STORES_HOME_HEADER_INNER_CLASS}>
          <div
            className={`${STORES_HOME_HEADER_ACTION_ROW_CLASS} ${STORES_HOME_HEADER_HOME_ADDRESS_ROW_GRID_CLASS}`}
          >
            <button
              type="button"
              className={STORES_HOME_HEADER_ADDRESS_BUTTON_CLASS}
              aria-label={t("layout_neighborhood_address_aria", { line: headerLine })}
              onClick={() =>
                router.push(
                  buildMypageAddressesHrefFromPath(
                    pathname,
                    searchParams?.toString() ? `?${searchParams.toString()}` : "",
                  ),
                )
              }
            >
              <span className={STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS}>
                <AddressKindHeadPin kind="master" className={STORES_HOME_HEADER_ADDRESS_PIN_CLASS} />
                <span className={STORES_HOME_HEADER_ADDRESS_LINE_CLASS}>{headerLine}</span>
              </span>
              <ChevronDownIcon className={STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS} />
            </button>
            <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} h-full justify-self-end self-stretch`}>
              <StoresConsumerHeaderActions />
            </div>
          </div>
          {/* PTR — 헤더 안에서만 확장(헤더 배경 위 다크 문구·스피너). UI SSOT: `DibayPtrSlot` */}
          <DibayPtrSlot store={storesHomePtrStore} tone="onSurface" dataAttribute="data-stores-home-ptr-hint" />
        </div>
      </header>
    </>
  );
}
