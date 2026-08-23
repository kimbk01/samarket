"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { StoresHomeCategoriesSkeleton } from "@/components/stores/home/hub/StoresHomeCategoriesSkeleton";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import {
  deriveHomeSecondaryReveal,
  getStoresHomeCategoryChromeHandlers,
  getStoresHomeCategoryChromeServerSnapshot,
  getStoresHomeCategoryChromeSnapshot,
  subscribeStoresHomeCategoryChrome,
} from "@/lib/stores/stores-home-category-chrome-store";
import { onBrowseSubTaxonomyCommit } from "@/lib/stores/stores-browse-taxonomy-interaction";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import { STORES_HOME_SUB_CATEGORY_SLIDE_MS } from "@/lib/stores/stores-home-sub-category-slide";
import type { StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";
import {
  STORES_HOME_SUB_CATEGORY_ICON_WRAP,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
  STORES_HOME_SUB_CATEGORY_RAIL,
  STORES_HOME_SUB_CATEGORY_SECTION_BODY,
  STORES_HOME_SUB_CATEGORY_SECTION_INNER,
  STORES_HOME_SUB_CATEGORY_SLIDE_LAYER,
  STORES_HOME_SUB_CATEGORY_SLIDE_STAGE,
} from "@/lib/stores/stores-home-ui";

const RESTAURANT_SLUG = "restaurant";

function StoresHomeSubCategoryRail({
  primarySlug,
  subs,
  language,
}: {
  primarySlug: string;
  subs: StoreTaxonomyTopic[];
  language: "ko" | "en";
}) {
  const { onPrewarmSub } = getStoresHomeCategoryChromeHandlers();
  const [pressedSlug, setPressedSlug] = useState<string | null>(null);
  const clearPressed = (el?: EventTarget | null) => {
    if (el instanceof HTMLElement) {
      el.classList.remove("stores-home-sub-category-link--pressed");
    }
    setPressedSlug(null);
  };

  return (
    <div className={STORES_HOME_SUB_CATEGORY_RAIL}>
      {subs.map((s, idx) => {
        const subSlug = String(s.slug ?? "").trim().toLowerCase();
        const uploaded = storeTaxonomyUploadedImageUrl(s.image_url);
        const src = uploaded ? resolveStoreTaxonomyImageSrc(uploaded, null) : null;
        const label =
          primarySlug === RESTAURANT_SLUG ?
            resolveStoreFoodSubtopicLabel(
              language,
              subSlug,
              String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim()
            )
          : resolveStoreTopicLabel(
              language,
              s.slug,
              String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim(),
              (s as { name_en?: string | null }).name_en
            );
        const pressed = pressedSlug === s.slug;
        return (
          <Link
            key={s.id}
            href={storesBrowsePath(primarySlug, s.slug)}
            prefetch={false}
            className={`${STORES_HOME_SUB_CATEGORY_LINK} ${pressed ? "stores-home-sub-category-link--pressed" : ""}`}
            aria-label={label}
            onPointerDown={(e) => {
              e.currentTarget.classList.add("stores-home-sub-category-link--pressed");
              setPressedSlug(s.slug);
              window.setTimeout(() => {
                triggerLightTapFeedback(e);
                onPrewarmSub(s.slug);
              }, 0);
            }}
            onPointerUp={(e) => clearPressed(e.currentTarget)}
            onPointerCancel={(e) => clearPressed(e.currentTarget)}
            onPointerLeave={(e) => clearPressed(e.currentTarget)}
            onClick={(e) => {
              clearPressed(e.currentTarget);
              /** browse 와 동일 pending — cold 첫 fetch 가 sub=all 로 넓어지지 않게 */
              onBrowseSubTaxonomyCommit(primarySlug, s.slug);
            }}
          >
            <span className={`${STORES_HOME_SUB_CATEGORY_ICON_WRAP} ${STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}`}>
              {src ?
                <StoreTaxonomyThumb
                  src={src}
                  alt=""
                  isUploaded
                  imgSize="fill"
                  frameClassName="h-full w-full"
                  loading={idx < STORES_HOME_TAXONOMY_EAGER_ICON_COUNT ? "eager" : "lazy"}
                />
              : (
                <span className="flex h-full w-full items-center justify-center bg-[color:var(--delivery-bg-muted)] text-[10px] font-semibold text-[color:var(--delivery-text-muted)]">
                  {label.slice(0, 2)}
                </span>
              )}
            </span>
            <span className={STORES_HOME_SUB_CATEGORY_LABEL}>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * CONTRACT — 헤더 고정 2차 업종 행. 한 행 가로 스와이프. 1차 탭 전환 시 360ms 우→좌 슬라이드.
 */
export function StoresHomeSubCategoryPanel() {
  const snap = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    getStoresHomeCategoryChromeSnapshot,
    getStoresHomeCategoryChromeServerSnapshot
  );
  const prevSlugRef = useRef(snap.activeSlug);
  const prevSubsRef = useRef(snap.subs);
  const [transition, setTransition] = useState<{
    fromSlug: string;
    toSlug: string;
    fromSubs: StoreTaxonomyTopic[];
    toSubs: StoreTaxonomyTopic[];
  } | null>(null);

  useLayoutEffect(() => {
    if (prevSlugRef.current === snap.activeSlug) {
      prevSubsRef.current = snap.subs;
      return;
    }
    setTransition({
      fromSlug: prevSlugRef.current,
      toSlug: snap.activeSlug,
      fromSubs: prevSubsRef.current,
      toSubs: snap.subs,
    });
    prevSlugRef.current = snap.activeSlug;
    prevSubsRef.current = snap.subs;
    const id = window.setTimeout(() => setTransition(null), STORES_HOME_SUB_CATEGORY_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [snap.activeSlug, snap.subs]);

  useLayoutEffect(() => {
    if (snap.taxonomyReady && deriveHomeSecondaryReveal(snap)) {
      markStoresHomePerf("category");
    }
  }, [snap]);

  const secondaryReveal = deriveHomeSecondaryReveal(snap);

  if (!secondaryReveal) {
    if (!transition) return null;
  } else if (!snap.taxonomyReady) {
    return <StoresHomeCategoriesSkeleton />;
  }

  if (snap.subs.length === 0 && !transition) return null;

  return (
    <section
      className={STORES_HOME_SUB_CATEGORY_SECTION_BODY}
      aria-label="store sub categories"
      data-stores-perf="category"
    >
      <div className={STORES_HOME_SUB_CATEGORY_SECTION_INNER}>
      <div className={STORES_HOME_SUB_CATEGORY_SLIDE_STAGE}>
        {transition ?
          <>
            <div className={`${STORES_HOME_SUB_CATEGORY_SLIDE_LAYER} stores-home-sub-slide-out absolute inset-x-0 top-0`}>
              <StoresHomeSubCategoryRail
                primarySlug={transition.fromSlug}
                subs={transition.fromSubs}
                language={snap.language}
              />
            </div>
            <div className={`${STORES_HOME_SUB_CATEGORY_SLIDE_LAYER} stores-home-sub-slide-in relative`}>
              <StoresHomeSubCategoryRail
                primarySlug={transition.toSlug}
                subs={transition.toSubs}
                language={snap.language}
              />
            </div>
          </>
        : <div className={STORES_HOME_SUB_CATEGORY_SLIDE_LAYER}>
            <StoresHomeSubCategoryRail
              primarySlug={snap.activeSlug}
              subs={snap.subs}
              language={snap.language}
            />
          </div>
        }
      </div>
      </div>
    </section>
  );
}
