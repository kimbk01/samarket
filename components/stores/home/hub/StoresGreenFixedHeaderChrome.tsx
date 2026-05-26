"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { SectorHeaderBackButton } from "@/components/layout/sector-header/SectorHeaderBackButton";
import { PhilifeHeaderNotificationInbox } from "@/components/philife/PhilifeHeaderNotificationInbox";
import { StoresHomeSearchModal } from "@/components/stores/home/hub/StoresHomeSearchModal";
import {
  STORES_HOME_HEADER_ACTION_ROW_CLASS,
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_APPLY_TITLE_CLASS,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
  STORES_HOME_HEADER_INNER_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";

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

export type StoresGreenFixedHeaderChromeProps = {
  title: string;
  backAriaLabel: string;
  /** 없으면 히스토리 back 만 (폴백 href 없음) */
  backHref?: string;
  preferHistoryBack?: boolean;
  /** true — `/stores` 홈·입점 신청과 동일 우측 검색·알림 */
  showSearchAndNotifications?: boolean;
  /** 검색·알림 대신 커스텀 우측 슬롯 */
  trailing?: ReactNode;
};

/**
 * `/stores` 녹색 1단 헤더 — BodyPortal 고정, 60px+safe-area 계약(`stores-home-header-chrome.ts`).
 */
export function StoresGreenFixedHeaderChrome({
  title,
  backHref,
  backAriaLabel,
  preferHistoryBack = true,
  showSearchAndNotifications = false,
  trailing,
}: StoresGreenFixedHeaderChromeProps) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const right =
    trailing ??
    (showSearchAndNotifications ? (
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
        <PhilifeHeaderNotificationInbox tone="onPrimary" />
      </div>
    ) : (
      <div
        className="h-[length:var(--delivery-header-action)] w-[length:var(--delivery-header-action)] shrink-0"
        aria-hidden
      />
    ));

  return (
    <>
      <BodyPortal>
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] pt-[env(safe-area-inset-top,0px)]">
          <header data-stores-home-header className={`pointer-events-auto ${STORES_HOME_HEADER_SHELL_CLASS}`}>
            <div className={STORES_HOME_HEADER_INNER_CLASS}>
              <div
                className={`${STORES_HOME_HEADER_ACTION_ROW_CLASS} grid-cols-[auto_minmax(0,1fr)_auto]`}
              >
                <SectorHeaderBackButton
                  backHref={backHref}
                  preferHistoryBack={preferHistoryBack}
                  ariaLabel={backAriaLabel}
                  className="!flex !h-[length:var(--delivery-header-action)] !w-[length:var(--delivery-header-action)] !items-center !justify-center !text-[var(--dibay-cream)] hover:bg-white/10 active:bg-white/15"
                />
                <h1 className={STORES_HOME_HEADER_APPLY_TITLE_CLASS}>{title}</h1>
                {right}
              </div>
            </div>
          </header>
        </div>
      </BodyPortal>
      {showSearchAndNotifications ? (
        <StoresHomeSearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          anchorRef={searchTriggerRef}
        />
      ) : null}
    </>
  );
}
