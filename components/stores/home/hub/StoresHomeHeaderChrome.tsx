"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhilifeHeaderNotificationInbox } from "@/components/philife/PhilifeHeaderNotificationInbox";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import {
  STORES_HOME_HEADER_ACTION_ROW_CLASS,
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
  STORES_HOME_HEADER_INNER_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";
import { StoresHomeSearchModal } from "@/components/stores/home/hub/StoresHomeSearchModal";
import { StoresHomeAddressSheet } from "@/components/stores/home/hub/StoresHomeAddressSheet";
import {
  getStoresHomePullRefreshServerSnapshot,
  getStoresHomePullRefreshSnapshot,
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

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 1118.5 10c0 5.3-6.5 11-6.5 11z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * CONTRACT — `/stores` 배민형 고정 헤더 + 당김 새로고침 힌트.
 * DO NOT: `store_address_manage_link` 를 버튼 라벨로 — `resolveDeliveryHomeHeaderButtonLabel` 만.
 */
export function StoresHomeHeaderChrome() {
  const { t } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const headerLine = resolveDeliveryHomeHeaderButtonLabel(address);
  const pull = useSyncExternalStore(
    subscribeStoresHomePullRefresh,
    getStoresHomePullRefreshSnapshot,
    getStoresHomePullRefreshServerSnapshot
  );
  const showPullHint = pull.pullPx > 2 || pull.refreshing;
  const pullReady = pull.pullPx >= STORES_HOME_PULL_REFRESH_THRESHOLD_PX;
  /** PTR — 녹색 헤더 영역만 확장. 본문은 flex 로 헤더 아래에 붙음(translate 금지). */
  const pullHintHeight =
    pull.refreshing ? "var(--delivery-home-ptr-hint-min-h, 2.75rem)"
    : showPullHint ? `${Math.max(pull.pullPx, 0)}px`
    : "0px";

  return (
    <>
      <header
        data-stores-home-header
        className={`${STORES_HOME_HEADER_SHELL_CLASS} z-[3]`}
      >
        <div className={STORES_HOME_HEADER_INNER_CLASS}>
          <div
            className={`${STORES_HOME_HEADER_ACTION_ROW_CLASS} grid-cols-[minmax(0,50%)_1fr]`}
          >
            <button
              type="button"
              className="flex min-w-0 w-full items-center gap-1 text-left"
              aria-label={t("layout_neighborhood_address_aria", { line: headerLine })}
              aria-haspopup="dialog"
              aria-expanded={addressOpen}
              onClick={() => setAddressOpen(true)}
            >
              <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                <MapPinIcon className="h-[length:var(--delivery-header-icon-glyph)] w-[length:var(--delivery-header-icon-glyph)] shrink-0 text-[#fffcfc]" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-tight">{headerLine}</span>
              </span>
              <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-90" />
            </button>
            <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} justify-self-end`}>
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
              <PhilifeHeaderNotificationInbox tone="onPrimary" />
            </div>
          </div>
          <div
            className="overflow-hidden text-center transition-[height,opacity] duration-150 ease-out"
            style={{
              height: pullHintHeight,
              opacity: showPullHint ? 1 : 0,
            }}
            aria-live="polite"
          >
            <p className="flex h-full min-h-0 flex-col items-center justify-center px-2 text-[13px] font-medium leading-snug text-white/92">
              {pull.refreshing ?
                t("store_home_pull_refreshing")
              : pullReady ?
                t("store_home_pull_release")
              : t("store_home_pull_hint")}
            </p>
          </div>
        </div>
      </header>
      <StoresHomeSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        anchorRef={searchTriggerRef}
      />
      <StoresHomeAddressSheet open={addressOpen} onClose={() => setAddressOpen(false)} />
    </>
  );
}
