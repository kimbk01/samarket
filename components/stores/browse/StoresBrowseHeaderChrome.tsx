"use client";

import { Suspense, useMemo } from "react";
import { StoresBrowseHeaderScrollCollapse } from "@/components/stores/browse/StoresBrowseHeaderScrollCollapse";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { SectorHeaderBackButton } from "@/components/layout/sector-header/SectorHeaderBackButton";
import { StoresBrowseHeaderMenuTabs } from "@/components/stores/browse/StoresBrowseHeaderMenuTabs";
import { useBrowsePrimaryIndustries } from "@/lib/stores/use-browse-primary-industries";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";
import { StoresConsumerHeaderActions } from "@/components/stores/home/hub/StoresConsumerHeaderActions";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { resolveTaxonomyIndustryLabel } from "@/lib/stores/store-taxonomy-canonical";
import {
  findDeliveryMenuRoot,
  resolveDeliveryMenuLabel,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import {
  STORES_HOME_HEADER_ACTIONS_CLUSTER,
  STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS,
} from "@/lib/design/stores-home-header-chrome";
import {
  MIRROR_ADDRESS_BUTTON_CLASS,
  MIRROR_ADDRESS_ROW_CLASS,
  MIRROR_ADDRESS_ROW_H_PX,
  MIRROR_HEADER_ROW_CLASS,
  MIRROR_HEADER_SHELL_CLASS,
  MIRROR_HEADER_TITLE_CLASS,
} from "@/lib/design/delivery-baemin-mirror";

function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <path d="M1.5 3h7L5 7.5z" />
    </svg>
  );
}

/**
 * `/stores/browse/*` — 배민 미러링 메뉴 페이지 헤더 (설계 v6 §1)
 * 1단 54px: ← · 「{상단 탭 이름}」 · 🔍 🛒 [고정, 흰 바탕]
 * 2단 32px: 「주소 ▾」 — 목록 스크롤 시 접힘 (`StoresBrowseHeaderScrollCollapse`)
 * 3단 40px: 「홈 · 메뉴 …」 텍스트 탭 + ⌄ 메뉴 전체보기 [고정] (`StoresBrowseHeaderMenuTabs`)
 * 4단 58px: PTR 슬롯 + 필터 칩 — `StoresBrowsePrimaryView` `stickyBelow` (PTR 잠금 위치 그대로)
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
  const extras = useMainTier1ExtrasOptional()?.extras;
  const address = useDeliveryHomeHeaderAddress();
  const primaries = useBrowsePrimaryIndustries();
  const taxonomy = useBrowseTaxonomySnapshot();

  const addressLine = useMemo(
    () => resolveDeliveryHomeHeaderButtonLabel(address, language),
    [address, language]
  );

  const title = useMemo(() => {
    const slug = browsePrimarySlug.trim().toLowerCase();
    if (slug) {
      const root = findDeliveryMenuRoot(taxonomy?.menus, slug);
      if (root) return resolveDeliveryMenuLabel(root, language);
      const primaryFromSnapshot = primaries.find((p) => p.slug.toLowerCase() === slug);
      if (primaryFromSnapshot) {
        return resolveTaxonomyIndustryLabel(
          language,
          primaryFromSnapshot.nameKo,
          primaryFromSnapshot.name_en ?? primaryFromSnapshot.nameEn,
          primaryFromSnapshot.slug
        );
      }
      const fromExtras = extras?.tier1?.titleText?.trim();
      return fromExtras || "";
    }
    const fromExtras = extras?.tier1?.titleText?.trim();
    if (fromExtras) return fromExtras;
    return safeT("navigation_delivery");
  }, [browsePrimarySlug, extras?.tier1?.titleText, language, primaries, safeT, taxonomy?.menus]);

  return (
    <>
      <header data-stores-browse-header data-baemin-mirror="1" className={MIRROR_HEADER_SHELL_CLASS}>
        <div className={MIRROR_HEADER_ROW_CLASS}>
          <SectorHeaderBackButton
            backHref="/stores"
            preferHistoryBack={false}
            className="!flex !h-[44px] !w-[36px] shrink-0 !items-center !justify-start !text-[color:#362415] active:opacity-60"
            ariaLabelKey="nav_back"
          />
          <h1 className={MIRROR_HEADER_TITLE_CLASS}>
            <span className="truncate">{title}</span>
          </h1>
          <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} h-full justify-self-end self-stretch`}>
            <StoresConsumerHeaderActions variant="browse" />
          </div>
        </div>
      </header>
      {browsePrimarySlug ?
        <div
          className={`${STORES_HOME_HEADER_BROWSE_TABS_STACK_CLASS} isolate !border-t-0 !bg-white`}
          style={{ ["--dibay-secondary-tab-row-h" as string]: `${MIRROR_ADDRESS_ROW_H_PX}px` }}
        >
          {/* 배민 — 스크롤하면 주소줄만 접히고 1단·3단·4단은 고정 */}
          <StoresBrowseHeaderScrollCollapse>
            <div className={MIRROR_ADDRESS_ROW_CLASS}>
              <button
                type="button"
                className={MIRROR_ADDRESS_BUTTON_CLASS}
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
                <AddressKindHeadPin kind="master" className="h-[15px] w-[15px] shrink-0 [&_svg]:h-full [&_svg]:w-full" />
                <span className="truncate">{addressLine}</span>
                <CaretDownIcon className="h-2.5 w-2.5 shrink-0" />
              </button>
            </div>
          </StoresBrowseHeaderScrollCollapse>
          <Suspense fallback={null}>
            <StoresBrowseHeaderMenuTabs primarySlug={browsePrimarySlug} />
          </Suspense>
        </div>
      : null}
    </>
  );
}
