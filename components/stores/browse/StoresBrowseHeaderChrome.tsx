"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { StoresBrowseHeaderScrollCollapse } from "@/components/stores/browse/StoresBrowseHeaderScrollCollapse";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { SectorHeaderBackButton } from "@/components/layout/sector-header/SectorHeaderBackButton";
import { StoresBrowseHeaderMenuTabs } from "@/components/stores/browse/StoresBrowseHeaderMenuTabs";
import { StoresBrowsePrimaryIndustryMenuPanel } from "@/components/stores/browse/StoresBrowsePrimaryIndustryMenuPanel";
import { useBrowsePrimaryIndustries } from "@/lib/stores/use-browse-primary-industries";
import { StoresConsumerHeaderActions } from "@/components/stores/home/hub/StoresConsumerHeaderActions";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { resolveTaxonomyIndustryLabel } from "@/lib/stores/store-taxonomy-canonical";
import { useBrowseSubtopicCollapsed } from "@/lib/stores/use-browse-subtopic-collapsed";
import {
  getBrowsePrimaryPendingNavServerSnapshot,
  getBrowsePrimaryPendingNavSnapshot,
  resolveBrowsePrimaryTabActiveSlug,
  subscribeBrowsePrimaryTabPendingNav,
} from "@/lib/stores/browse-primary-tab-navigation";
import {
  STORES_HOME_HEADER_ACTION_ROW_CLASS,
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS,
  STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS,
  STORES_HOME_HEADER_ADDRESS_LINE_CLASS,
  STORES_HOME_HEADER_ADDRESS_PIN_CLASS,
  STORES_HOME_HEADER_BROWSE_ADDRESS_CHEVRON_BTN_CLASS,
  STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CLASS,
  STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CONTENT_CLASS,
  STORES_HOME_HEADER_BROWSE_INNER_CLASS,
  STORES_HOME_HEADER_BROWSE_ROW_CLASS,
  STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_BACKDROP_CLASS,
  STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_ANCHOR_CLASS,
  STORES_HOME_HEADER_BROWSE_TABS_INNER_CLASS,
  STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS,
  STORES_HOME_HEADER_BROWSE_TITLE_BUTTON_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/**
 * `/stores/browse/*` — 배민형 업종 페이지 헤더 (WP3)
 * 1단: 뒤로 · 「{1단 메뉴 이름} ⌄」(1단 전환 패널) · 검색 · 주문 · 카트 · 알림 [고정]
 * 2단: 핀·주소 + ▼ 주소 시트 — 목록 스크롤 시 접힘 (`StoresBrowseHeaderScrollCollapse`)
 * 3단: 2단 메뉴 텍스트 탭 「전체 · …」 + 밑줄 [고정] (`StoresBrowseHeaderMenuTabs`)
 * 4단: PTR 슬롯 + 정렬 칩 — `StoresBrowsePrimaryView` `stickyBelow` (PTR 잠금 위치 그대로)
 * 1차 숨김: `BrowseSubtopicCollapseSentinel` + `browse-subtopic-collapse-chrome`(IO·geometry sync).
 * 하단 탭: `browse-scroll-chrome` (분리).
 *
 * CONTRACT — taxonomy: `useBrowsePrimaryIndustries`·`useBrowseSubIndustries` 가
 * `browse-taxonomy-snapshot` 단일 로드 공유. DO NOT: 헤더·목록 각각 `fetchStoresTaxonomyDeduped`.
 */
export function StoresBrowseHeaderChrome() {
  const { t, language, safeT } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const browsePrimarySlug = useMemo(
    () => pathname?.match(/^\/stores\/browse\/([^/?]+)/)?.[1]?.trim().toLowerCase() ?? "",
    [pathname]
  );
  const pendingPrimaryNav = useSyncExternalStore(
    subscribeBrowsePrimaryTabPendingNav,
    getBrowsePrimaryPendingNavSnapshot,
    getBrowsePrimaryPendingNavServerSnapshot,
  );
  const menuActivePrimarySlug =
    resolveBrowsePrimaryTabActiveSlug(browsePrimarySlug || null, pendingPrimaryNav) ?? browsePrimarySlug;
  const extras = useMainTier1ExtrasOptional()?.extras;
  const address = useDeliveryHomeHeaderAddress();
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);
  const primaryCollapsed = useBrowseSubtopicCollapsed();
  const primaries = useBrowsePrimaryIndustries();

  const addressLine = useMemo(
    () => resolveDeliveryHomeHeaderButtonLabel(address, language),
    [address, language]
  );

  const title = useMemo(() => {
    const primarySlug = menuActivePrimarySlug?.trim().toLowerCase();
    if (primarySlug) {
      const primaryFromSnapshot = primaries.find((p) => p.slug.toLowerCase() === primarySlug);
      if (primaryFromSnapshot) {
        return resolveTaxonomyIndustryLabel(
          language,
          primaryFromSnapshot.nameKo,
          primaryFromSnapshot.name_en ?? primaryFromSnapshot.nameEn,
          primaryFromSnapshot.slug
        );
      }
      return primarySlug;
    }
    const fromExtras = extras?.tier1?.titleText?.trim();
    if (fromExtras) return fromExtras;
    return safeT("navigation_delivery");
  }, [extras?.tier1?.titleText, menuActivePrimarySlug, primaries, language, safeT]);

  useEffect(() => {
    if (primaryCollapsed && primaryMenuOpen) setPrimaryMenuOpen(false);
  }, [primaryCollapsed, primaryMenuOpen]);

  return (
    <>
      <header
        data-stores-browse-header
        className={STORES_HOME_HEADER_SHELL_CLASS}
      >
        <div className={STORES_HOME_HEADER_BROWSE_INNER_CLASS}>
          <div className={`${STORES_HOME_HEADER_ACTION_ROW_CLASS} ${STORES_HOME_HEADER_BROWSE_ROW_CLASS}`}>
            <SectorHeaderBackButton
              backHref="/stores"
              preferHistoryBack={false}
              className="!flex !h-[length:var(--delivery-header-action)] !w-[length:var(--delivery-header-action)] shrink-0 !items-center !justify-center !text-[color:var(--sector-header-icon-color,#243832)] hover:bg-black/5 active:bg-black/10"
              ariaLabelKey="nav_back"
            />
            <h1 className="flex h-full min-w-0 flex-1">
              <button
                type="button"
                className={STORES_HOME_HEADER_BROWSE_TITLE_BUTTON_CLASS}
                aria-expanded={primaryMenuOpen}
                aria-haspopup="menu"
                onClick={() => setPrimaryMenuOpen((open) => !open)}
              >
                <span className="truncate">{title}</span>
                <ChevronDownIcon
                  className={`h-3 w-3 shrink-0 transition-transform duration-150 ${primaryMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h1>
            <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} h-full justify-self-end self-stretch`}>
              <StoresConsumerHeaderActions />
            </div>
          </div>
        </div>
      </header>
      {browsePrimarySlug ?
        <div className={`${STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS} isolate`}>
          <div className={`${STORES_HOME_HEADER_BROWSE_TABS_INNER_CLASS} relative`}>
            {primaryMenuOpen ?
              <>
                <button
                  type="button"
                  className={STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_BACKDROP_CLASS}
                  aria-label={t("common_close")}
                  onClick={() => setPrimaryMenuOpen(false)}
                />
                <div className={STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_ANCHOR_CLASS}>
                  <StoresBrowsePrimaryIndustryMenuPanel
                    open={primaryMenuOpen}
                    onClose={() => setPrimaryMenuOpen(false)}
                    primaries={primaries}
                    activeSlug={menuActivePrimarySlug || null}
                  />
                </div>
              </>
            : null}
            {/* WP3 — 배민과 같이 스크롤하면 주소줄만 접히고, 상단바·2단 탭은 고정 */}
            <StoresBrowseHeaderScrollCollapse>
              <div
                className={`${STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CLASS} h-[length:var(--dibay-secondary-tab-row-h,44px)]`}
              >
                <div className={STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CONTENT_CLASS}>
                  <span className={STORES_HOME_HEADER_ADDRESS_LABEL_CLUSTER_CLASS}>
                    <AddressKindHeadPin kind="master" className={STORES_HOME_HEADER_ADDRESS_PIN_CLASS} />
                    <span className={STORES_HOME_HEADER_ADDRESS_LINE_CLASS}>{addressLine}</span>
                  </span>
                  <button
                    type="button"
                    className={STORES_HOME_HEADER_BROWSE_ADDRESS_CHEVRON_BTN_CLASS}
                    aria-label={t("layout_neighborhood_address_aria", { line: addressLine })}
                    onClick={() =>
                      router.push(
                        buildMypageAddressesHrefFromPath(
                          pathname,
                          searchParams?.toString() ? `?${searchParams.toString()}` : "",
                        ),
                      )
                    }
                  >
                    <ChevronDownIcon className={STORES_HOME_HEADER_ADDRESS_CHEVRON_CLASS} />
                  </button>
                </div>
              </div>
            </StoresBrowseHeaderScrollCollapse>
            <Suspense fallback={null}>
              <StoresBrowseHeaderMenuTabs primarySlug={browsePrimarySlug} />
            </Suspense>
          </div>
        </div>
      : null}
    </>
  );
}
