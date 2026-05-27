"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { StoresHomeCategoriesSkeleton } from "@/components/stores/home/hub/StoresHomeCategoriesSkeleton";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import { getMainAppScrollRootCached } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import {
  getStoresHomeCategoryChromeHandlers,
  getStoresHomeCategoryChromeServerSnapshot,
  getStoresHomeCategoryChromeSnapshot,
  patchStoresHomeCategoryChrome,
  subscribeStoresHomeCategoryChrome,
} from "@/lib/stores/stores-home-category-chrome-store";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import { STORES_HOME_SUB_CATEGORY_SLIDE_MS } from "@/lib/stores/stores-home-sub-category-slide";
import type { StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import {
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
  STORES_HOME_SUB_CATEGORY_RAIL,
  STORES_HOME_SUB_CATEGORY_SECTION_BODY,
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
        return (
          <Link
            key={s.id}
            href={storesBrowsePath(primarySlug, s.slug)}
            prefetch={false}
            onPointerDown={() => onPrewarmSub(s.slug)}
            className={STORES_HOME_SUB_CATEGORY_LINK}
            aria-label={label}
          >
            <span className={STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}>
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
 * CONTRACT — 2차 업종 스크롤 본문. 한 행 가로 스와이프. 1차 탭 전환 시 360ms 우→좌 슬라이드.
 */
export function StoresHomeSubCategoryPanel() {
  const snap = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    getStoresHomeCategoryChromeSnapshot,
    getStoresHomeCategoryChromeServerSnapshot
  );
  const sectionRef = useRef<HTMLElement>(null);
  const prevSlugRef = useRef(snap.activeSlug);
  const prevSubsRef = useRef(snap.subs);
  const [transition, setTransition] = useState<{
    fromSlug: string;
    toSlug: string;
    fromSubs: StoreTaxonomyTopic[];
    toSubs: StoreTaxonomyTopic[];
  } | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !snap.taxonomyReady) return;
    const root = getMainAppScrollRootCached();

    const syncInView = () => {
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.height <= 0) return;
      const visiblePx = Math.min(elRect.bottom, rootRect.bottom) - Math.max(elRect.top, rootRect.top);
      const ratio = visiblePx / elRect.height;
      patchStoresHomeCategoryChrome({
        subCategoryInView: ratio >= 0.45 && elRect.bottom > rootRect.top + 2,
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        patchStoresHomeCategoryChrome({
          subCategoryInView: Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.45),
        });
      },
      { root, threshold: [0, 0.2, 0.45, 0.7, 1] }
    );
    io.observe(el);
    syncInView();
    const unsubScroll = subscribeAppShellScroll(syncInView, { passive: true });
    return () => {
      io.disconnect();
      unsubScroll();
    };
  }, [snap.taxonomyReady, snap.subs.length]);

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
    if (snap.taxonomyReady && snap.subs.length > 0) {
      markStoresHomePerf("category");
    }
  }, [snap.subs.length, snap.taxonomyReady]);

  if (!snap.taxonomyReady) {
    return <StoresHomeCategoriesSkeleton />;
  }

  if (snap.subs.length === 0 && !transition) return null;

  return (
    <section
      ref={sectionRef}
      className={STORES_HOME_SUB_CATEGORY_SECTION_BODY}
      aria-label="store sub categories"
      data-stores-perf="category"
    >
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
    </section>
  );
}
