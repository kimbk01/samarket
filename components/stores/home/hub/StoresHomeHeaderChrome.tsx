"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderNotificationInbox } from "@/components/philife/PhilifeHeaderNotificationInbox";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { DELIVERY_TIER1_HEADER_INNER_CLASS } from "@/lib/design/delivery-chrome";
import {
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
} from "@/lib/design/stores-home-header-chrome";
import { StoresHomeBuyerHeaderActions } from "@/components/stores/home/hub/StoresHomeBuyerHeaderActions";
import { StoresHomeSearchModal } from "@/components/stores/home/hub/StoresHomeSearchModal";
import { StoresHomeAddressSheet } from "@/components/stores/home/hub/StoresHomeAddressSheet";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

/**
 * CONTRACT — `/stores` 배민형 고정 헤더.
 * DO NOT: `store_address_manage_link` 를 버튼 라벨로 — `resolveDeliveryHomeHeaderButtonLabel` 만.
 */
export function StoresHomeHeaderChrome() {
  const { t } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const headerLine = resolveDeliveryHomeHeaderButtonLabel(address);

  return (
    <>
      <header className="delivery-ui w-full shrink-0 bg-[color:var(--delivery-home-header-bg)] text-white">
        <div className={`${DELIVERY_TIER1_HEADER_INNER_CLASS} px-[var(--delivery-page-x)] pb-2 pt-2`}>
          <div className="flex min-h-[var(--delivery-header-action)] items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
              aria-label={t("layout_neighborhood_address_aria", { line: headerLine })}
              aria-haspopup="dialog"
              aria-expanded={addressOpen}
              onClick={() => setAddressOpen(true)}
            >
              <span className="truncate text-[16px] font-bold leading-tight">{headerLine}</span>
              <ChevronDownIcon className="h-3 w-3 shrink-0 opacity-90" />
            </button>
            <div className={STORES_HOME_HEADER_ACTIONS_CLUSTER}>
              <button
                type="button"
                className={STORES_HOME_HEADER_ICON_BTN_CLASS}
                aria-label={t("store_search_placeholder")}
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon />
              </button>
              <StoresHomeBuyerHeaderActions />
              <PhilifeHeaderNotificationInbox tone="onPrimary" />
            </div>
          </div>
        </div>
      </header>
      <StoresHomeSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <StoresHomeAddressSheet open={addressOpen} onClose={() => setAddressOpen(false)} />
    </>
  );
}
