"use client";

import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { StoresHomePrimaryCategoriesSkeleton } from "@/components/stores/home/hub/StoresHomeCategoriesSkeleton";
import { StoresHomeSubCategoryRail } from "@/components/stores/home/hub/StoresHomeSubCategoryRail";
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
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import { STORES_HOME_CHROME_INNER_CLASS, STORES_HOME_CHROME_INNER_DATA_ATTR } from "@/lib/stores/stores-home-header-layout";
import {
  getStoresHomeSecondaryRevealedServerSnapshot,
  getStoresHomeSecondaryRevealedSnapshot,
  registerStoresHomeTier3Boundary,
  subscribeStoresHomeSecondaryRevealed,
} from "@/lib/stores/stores-home-secondary-reveal-chrome";
import { noteStoresHomeTier2RevealedChanged } from "@/lib/stores/stores-home-header-runtime-instrumentation";
import {
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_ICON_INNER,
  STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE,
  STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY,
  STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE,
  STORES_HOME_SUB_CATEGORY_SECTION_BODY,
} from "@/lib/stores/stores-home-ui";

function StoresHomePrimaryCategoryRail({
  primaries,
  activeSlug,
  language,
  ariaLabel,
}: {
  primaries: StoreTaxonomyCategory[];
  activeSlug: string;
  language: "ko" | "en";
  ariaLabel: string;
}) {
  const { onSelectPrimary, onPrewarmPrimary } = getStoresHomeCategoryChromeHandlers();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    registerStoresHomePrimaryScrollEl(scrollRef.current);
    return () => registerStoresHomePrimaryScrollEl(null);
  }, []);

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
              frameClassName={`${STORES_HOME_PRIMARY_CATEGORY_ICON_INNER} ${on ? "scale-110" : "scale-100"}`}
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
    <div data-stores-home-tier="3" className={STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY}>
      <div
        {...{ [STORES_HOME_CHROME_INNER_DATA_ATTR]: "" }}
        className={`${STORES_HOME_CHROME_INNER_CLASS} flex items-center pt-1.5 pb-1`}
      >
        <div ref={scrollRef} className={STORES_HOME_PRIMARY_CATEGORY_SCROLL} role="tablist" aria-label={ariaLabel}>
          {tabs}
        </div>
      </div>
    </div>
  );
}

const StoresHomePrimaryCategoryRailMemo = memo(StoresHomePrimaryCategoryRail);

function StoresHomeTier2RevealShell({
  primarySlug,
  subs,
  language,
  revealed,
}: {
  primarySlug: string;
  subs: StoreTaxonomyTopic[];
  language: "ko" | "en";
  revealed: boolean;
}) {
  if (subs.length === 0) return null;

  return (
    <div
      data-stores-home-tier2-reveal
      data-stores-home-tier="2"
      data-revealed={revealed ? "true" : "false"}
      className="w-full shrink-0 overflow-hidden"
      aria-hidden={!revealed}
    >
      <section className={STORES_HOME_SUB_CATEGORY_SECTION_BODY} aria-label="store sub categories">
        <div {...{ [STORES_HOME_CHROME_INNER_DATA_ATTR]: "" }} className={`${STORES_HOME_CHROME_INNER_CLASS} pb-2 pt-0`}>
          <StoresHomeSubCategoryRail primarySlug={primarySlug} subs={subs} language={language} />
        </div>
      </section>
    </div>
  );
}

/**
 * CONTRACT — `/stores` TIER3 + TIER2 single header-stack instance (`MainTier1Extras.stickyBelow`).
 * DO NOT: scroll-body duplicate · sticky/body swap · scroll-driven navigation.
 */
export function StoresHomeChromeBelowTier1() {
  const tier3BoundaryRef = useRef<HTMLDivElement>(null);
  const snap = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    getStoresHomeCategoryChromeSnapshot,
    getStoresHomeCategoryChromeServerSnapshot
  );
  const secondaryRevealed = useSyncExternalStore(
    subscribeStoresHomeSecondaryRevealed,
    getStoresHomeSecondaryRevealedSnapshot,
    getStoresHomeSecondaryRevealedServerSnapshot
  );

  useLayoutEffect(() => {
    registerStoresHomeTier3Boundary(tier3BoundaryRef.current);
    return () => registerStoresHomeTier3Boundary(null);
  }, [snap.taxonomyReady]);

  useEffect(() => {
    noteStoresHomeTier2RevealedChanged(secondaryRevealed);
  }, [secondaryRevealed]);

  if (!snap.taxonomyReady) {
    return <StoresHomePrimaryCategoriesSkeleton />;
  }

  if (snap.primaries.length === 0) return null;

  return (
    <div data-stores-home-chrome-below-tier1 className="relative w-full shrink-0">
      <div className="relative w-full shrink-0">
        <StoresHomePrimaryCategoryRailMemo
          primaries={snap.primaries}
          activeSlug={snap.activeSlug}
          language={snap.language}
          ariaLabel={snap.primaryAriaLabel}
        />
        <div
          ref={tier3BoundaryRef}
          data-stores-home-tier3-boundary
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-0"
          aria-hidden
        />
      </div>
      <StoresHomeTier2RevealShell
        primarySlug={snap.activeSlug}
        subs={snap.subs}
        language={snap.language}
        revealed={secondaryRevealed}
      />
    </div>
  );
}

/** @deprecated — use `StoresHomeChromeBelowTier1` */
export const STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW = <StoresHomeChromeBelowTier1 />;
