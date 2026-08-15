"use client";

import dynamic from "next/dynamic";
import { Suspense, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { StoresBrowseHeaderScrollCollapse } from "@/components/stores/browse/StoresBrowseHeaderScrollCollapse";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { SectorHeaderBackButton } from "@/components/layout/sector-header/SectorHeaderBackButton";
import { StoresBrowseHeaderPrimaryTabs } from "@/components/stores/browse/StoresBrowseHeaderPrimaryTabs";
import { StoresBrowseHeaderSubTopicChips } from "@/components/stores/browse/StoresBrowseHeaderSubTopicChips";
import { StoresBrowsePrimaryIndustryMenuPanel } from "@/components/stores/browse/StoresBrowsePrimaryIndustryMenuPanel";
import { useBrowsePrimaryIndustries } from "@/lib/stores/use-browse-primary-industries";
import { StoresHomeHeaderNotificationInboxLazy } from "@/components/stores/home/hub/StoresHomeHeaderNotificationInboxLazy";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import { getBrowsePrimaryBySlug } from "@/lib/stores/browse-taxonomy-seed-queries";
import {
  getBrowsePrimaryTabOptimisticSlugServerSnapshot,
  getBrowsePrimaryTabOptimisticSlugSnapshot,
  resolveBrowsePrimaryTabActiveSlug,
  subscribeBrowsePrimaryTabOptimisticSlug,
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
  STORES_HOME_HEADER_BROWSE_PRIMARY_TABS_ROW_CLASS,
  STORES_HOME_HEADER_BROWSE_TABS_INNER_CLASS,
  STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS,
  STORES_HOME_HEADER_BROWSE_TITLE_CLASS,
  STORES_HOME_HEADER_ICON_BTN_CLASS,
  STORES_HOME_HEADER_SHELL_CLASS,
} from "@/lib/design/stores-home-header-chrome";

const StoresHomeSearchModal = dynamic(
  () => import("@/components/stores/home/hub/StoresHomeSearchModal").then((m) => m.StoresHomeSearchModal),
  { ssr: false }
);

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

/**
 * `/stores/browse/*` — 녹색 3단 헤더
 * 1단: 뒤로 · 제목 · 검색 · 알림
 * 2단: 핀·주소 표시 + ▼ 주소 시트
 * 3단(①): 1차 업종 텍스트 탭 + ▼
 * ▼ 패널: 2단(주소) 하단선·z-20 (4단 2차 칩 위)
 * 4단(②): 2차 업종 (`/stores` 홈 크기 · 1차 전환 360ms 슬라이드 · 목록 기본 `?sub=all`)
 * 5단: 정렬 칩 — `StoresBrowsePrimaryView` `stickyBelow`
 * 목록 스크롤 다운 시 **4단만** `StoresBrowseHeaderScrollCollapse` 로 접음(1·2·3·5단 유지).
 * 4단 숨김: `BrowseSubtopicCollapseSentinel` + `browse-subtopic-collapse-chrome`(IO·geometry sync).
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
  const optimisticPrimary = useSyncExternalStore(
    subscribeBrowsePrimaryTabOptimisticSlug,
    getBrowsePrimaryTabOptimisticSlugSnapshot,
    getBrowsePrimaryTabOptimisticSlugServerSnapshot,
  );
  const menuActivePrimarySlug =
    resolveBrowsePrimaryTabActiveSlug(browsePrimarySlug || null, optimisticPrimary) ?? browsePrimarySlug;
  const extras = useMainTier1ExtrasOptional()?.extras;
  const address = useDeliveryHomeHeaderAddress();
  const [searchOpen, setSearchOpen] = useState(false);
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
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
        return resolveStorePrimaryIndustryLabel(
          language,
          primaryFromSnapshot.slug,
          primaryFromSnapshot.nameKo,
          primaryFromSnapshot.name_en ?? primaryFromSnapshot.nameEn,
        );
      }
      const primary = getBrowsePrimaryBySlug(primarySlug);
      if (primary) return resolveStorePrimaryIndustryLabel(language, primary.slug, primary.nameKo);
      return primarySlug;
    }
    const fromExtras = extras?.tier1?.titleText?.trim();
    if (fromExtras) return fromExtras;
    return safeT("navigation_delivery");
  }, [extras?.tier1?.titleText, menuActivePrimarySlug, primaries, language, safeT]);

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
              className="!flex !h-[length:var(--delivery-header-action)] !w-[length:var(--delivery-header-action)] shrink-0 !items-center !justify-center !text-white hover:bg-white/10 active:bg-white/15"
              ariaLabelKey="nav_back"
            />
            <h1 className={STORES_HOME_HEADER_BROWSE_TITLE_CLASS}>{title}</h1>
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
              <StoresHomeHeaderNotificationInboxLazy />
            </div>
          </div>
          <div className={STORES_HOME_HEADER_BROWSE_ADDRESS_ROW_CLASS}>
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
            <div className={STORES_HOME_HEADER_BROWSE_PRIMARY_TABS_ROW_CLASS}>
              <StoresBrowseHeaderPrimaryTabs
                primaries={primaries}
                menuOpen={primaryMenuOpen}
                onMenuOpenChange={setPrimaryMenuOpen}
              />
            </div>
            <StoresBrowseHeaderScrollCollapse>
              <Suspense fallback={null}>
                <StoresBrowseHeaderSubTopicChips primarySlug={browsePrimarySlug} />
              </Suspense>
            </StoresBrowseHeaderScrollCollapse>
          </div>
        </div>
      : null}
      {searchOpen ?
        <StoresHomeSearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          anchorRef={searchTriggerRef}
        />
      : null}
    </>
  );
}
