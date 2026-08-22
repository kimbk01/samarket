"use client";

import { memo, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { StoresHomePrimaryCategoriesSkeleton } from "@/components/stores/home/hub/StoresHomeCategoriesSkeleton";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import {
  getStoresHomeCategoryChromeHandlers,
  getStoresHomeCategoryChromeServerSnapshot,
  getStoresHomeCategoryChromeSnapshot,
  registerStoresHomePrimaryScrollEl,
  subscribeStoresHomeCategoryChrome,
} from "@/lib/stores/stores-home-category-chrome-store";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import {
  STORES_HOME_CATEGORY_STICKY_STACK,
  STORES_HOME_PRIMARY_CATEGORY_ICON_INNER,
  STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED,
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_INNER,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY,
  STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE,
} from "@/lib/stores/stores-home-ui";

function StoresHomePrimaryCategoryRail({
  primaries,
  activeSlug,
  hasPrimarySelection,
  compactSticky,
  language,
  ariaLabel,
}: {
  primaries: StoreTaxonomyCategory[];
  activeSlug: string;
  hasPrimarySelection: boolean;
  compactSticky: boolean;
  language: "ko" | "en";
  ariaLabel: string;
}) {
  const { onSelectPrimary, onPrewarmPrimary } = getStoresHomeCategoryChromeHandlers();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollClassName =
    hasPrimarySelection ? STORES_HOME_PRIMARY_CATEGORY_SCROLL : STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED;

  useLayoutEffect(() => {
    registerStoresHomePrimaryScrollEl(scrollRef.current);
    return () => registerStoresHomePrimaryScrollEl(null);
  }, [hasPrimarySelection]);

  const tabs = primaries.map((p, index) => {
    const on = p.slug === activeSlug;
    const uploaded = storeTaxonomyUploadedImageUrl(p.image_url);
    const icon = uploaded ? resolveStoreTaxonomyImageSrc(uploaded, null) : null;
    const label = resolveStorePrimaryIndustryLabel(
      language,
      p.slug,
      String(p.name ?? "").trim(),
      p.name_en
    );
    return (
      <button
        key={p.id}
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => onSelectPrimary(p.slug)}
        onPointerDown={(e) => {
          window.setTimeout(() => {
            triggerLightTapFeedback(e);
            onPrewarmPrimary(p.slug);
          }, 0);
        }}
        className={STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON}
      >
        {icon ?
          <span className={STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT}>
            <StoreTaxonomyThumb
              src={icon}
              isUploaded={!!uploaded}
              dimmed={!on}
              imgSize="fill"
              loading={index < STORES_HOME_TAXONOMY_EAGER_ICON_COUNT ? "eager" : "lazy"}
              frameClassName={`${STORES_HOME_PRIMARY_CATEGORY_ICON_INNER} ${
                on && !compactSticky ? "scale-110" : "scale-100"
              }`}
            />
          </span>
        : null}
        <span className={on ? STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED : STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE}>
          {label}
        </span>
        <span
          className={on ? STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR : STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE}
          aria-hidden
        />
      </button>
    );
  });

  return (
    <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY}>
      <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_INNER}>
        <div ref={scrollRef} className={scrollClassName} role="tablist" aria-label={ariaLabel}>
          {tabs}
        </div>
      </div>
    </div>
  );
}

const StoresHomePrimaryCategoryRailMemo = memo(StoresHomePrimaryCategoryRail);

/**
 * CONTRACT — 맨 위: **2차 아래** 스크롤 본문 1차. 2차 보일 때만 렌더.
 */
export function StoresHomePrimaryCategoryPanel() {
  const snap = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    getStoresHomeCategoryChromeSnapshot,
    getStoresHomeCategoryChromeServerSnapshot
  );

  if (!snap.taxonomyReady) {
    return (
      <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY}>
        <StoresHomePrimaryCategoriesSkeleton />
      </div>
    );
  }

  if (snap.primaries.length === 0 || !snap.subCategoryInView) return null;

  return (
    <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY}>
      <StoresHomePrimaryCategoryRailMemo
        primaries={snap.primaries}
        activeSlug={snap.activeSlug}
        hasPrimarySelection={snap.pickedSlug !== null}
        compactSticky={false}
        language={snap.language}
        ariaLabel={snap.primaryAriaLabel}
      />
    </div>
  );
}

/**
 * CONTRACT — 2차 숨김 후: **헤더 stickyBelow** 고정 1차(노란). 피드 스크롤과 분리.
 */
export function StoresHomePrimaryCategoryHeaderSticky() {
  const snap = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    getStoresHomeCategoryChromeSnapshot,
    getStoresHomeCategoryChromeServerSnapshot
  );

  if (!snap.taxonomyReady || snap.subCategoryInView || snap.primaries.length === 0) {
    return null;
  }

  return (
    <div className={STORES_HOME_CATEGORY_STICKY_STACK}>
      <StoresHomePrimaryCategoryRailMemo
        primaries={snap.primaries}
        activeSlug={snap.activeSlug}
        hasPrimarySelection
        compactSticky
        language={snap.language}
        ariaLabel={snap.primaryAriaLabel}
      />
    </div>
  );
}

/** `MainTier1Extras.stickyBelow` — 2차 숨김 시에만 QuickCategories 가 등록 */
export const STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW = <StoresHomePrimaryCategoryHeaderSticky />;
