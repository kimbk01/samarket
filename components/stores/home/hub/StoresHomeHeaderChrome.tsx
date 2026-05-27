"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeHeaderNotificationInboxLazy } from "@/components/stores/home/hub/StoresHomeHeaderNotificationInboxLazy";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import {
  STORES_HOME_HEADER_ACTION_ROW_CLASS,
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_ADDRESS_BUTTON_CLASS,
  STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS,
  STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS,
  STORES_HOME_HEADER_ADDRESS_LINE_CLASS,
  STORES_HOME_HEADER_ADDRESS_PIN_CLASS,
  STORES_HOME_HEADER_HOME_ADDRESS_ROW_GRID_CLASS,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
  STORES_HOME_HEADER_INNER_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";
const StoresHomeSearchModal = dynamic(
  () => import("@/components/stores/home/hub/StoresHomeSearchModal").then((m) => m.StoresHomeSearchModal),
  { ssr: false }
);
const StoresHomeAddressSheet = dynamic(
  () => import("@/components/stores/home/hub/StoresHomeAddressSheet").then((m) => m.StoresHomeAddressSheet),
  { ssr: false }
);
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import {
  getStoresHomePullRefreshServerSnapshot,
  getStoresHomePullRefreshSnapshot,
  resolveStoresHomePullHintHeightPx,
  STORES_HOME_PULL_REFRESH_COLLAPSE_MS,
  STORES_HOME_PULL_REFRESH_THRESHOLD_PX,
  subscribeStoresHomePullRefresh,
} from "@/lib/stores/stores-home-pull-refresh-store";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
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

function StoresHomePtrSpinner() {
  return (
    <span
      className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/95"
      aria-hidden
    />
  );
}

/**
 * CONTRACT — `/stores` 배민형 고정 헤더 + 당김 새로고침 힌트.
 * DO NOT: `store_address_manage_link` 를 버튼 라벨로 — `resolveDeliveryHomeHeaderButtonLabel` 만.
 */
export function StoresHomeHeaderChrome() {
  const { t, language } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const headerLine = useMemo(
    () => resolveDeliveryHomeHeaderButtonLabel(address, language),
    [address, language],
  );
  const pull = useSyncExternalStore(
    subscribeStoresHomePullRefresh,
    getStoresHomePullRefreshSnapshot,
    getStoresHomePullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
  const hintHeightPx = resolveStoresHomePullHintHeightPx(pull);
  /** PTR — 녹색 헤더만 확장. 놓은 뒤 높이 유지 → 스피너 → ease-out 복귀 */
  const pullHintHeight = hintHeightPx > 0 ? `${hintHeightPx}px` : "0px";
  const hintTransitionMs =
    pull.refreshing ? 180 : hintHeightPx === 0 ? STORES_HOME_PULL_REFRESH_COLLAPSE_MS : 120;

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
              aria-haspopup="dialog"
              aria-expanded={addressOpen}
              onClick={() => setAddressOpen(true)}
            >
              <span className={STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS}>
                <AddressKindHeadPin kind="master" className={STORES_HOME_HEADER_ADDRESS_PIN_CLASS} />
                <span className={STORES_HOME_HEADER_ADDRESS_LINE_CLASS}>{headerLine}</span>
              </span>
              <ChevronDownIcon className={STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS} />
            </button>
            <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} h-full justify-self-end self-stretch`}>
              <button
                ref={searchTriggerRef}
                type="button"
                className={STORES_HOME_HEADER_ICON_BTN_CLASS}
                aria-label={t("store_search_placeholder")}
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon />
              </button>
              <StoresHomeHeaderNotificationInboxLazy tone="onPrimary" />
            </div>
          </div>
          <div
            className="overflow-hidden text-center ease-[cubic-bezier(0.33,1,0.68,1)]"
            style={{
              height: pullHintHeight,
              opacity: showPullHint ? 1 : 0,
              transitionProperty: "height, opacity",
              transitionDuration: `${hintTransitionMs}ms`,
              transitionTimingFunction: pull.refreshing ? "ease-out" : "cubic-bezier(0.33, 1, 0.68, 1)",
            }}
            aria-live="polite"
          >
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-2 py-1">
              {pull.refreshing ?
                <>
                  <StoresHomePtrSpinner />
                  <p className="text-[13px] font-medium leading-snug text-white/92">
                    {t("store_home_pull_refreshing")}
                  </p>
                </>
              : <p className="text-[13px] font-medium leading-snug text-white/92">
                  {pullReady ? t("store_home_pull_release") : t("store_home_pull_hint")}
                </p>
              }
            </div>
          </div>
        </div>
      </header>
      {searchOpen ?
        <StoresHomeSearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          anchorRef={searchTriggerRef}
        />
      : null}
      {addressOpen ?
        <StoresHomeAddressSheet open={addressOpen} onClose={() => setAddressOpen(false)} />
      : null}
    </>
  );
}
