"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { storesBrowseNavSubSlug, storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { resolveStoreTopicLabel } from "@/lib/i18n/store-browse-label-i18n";
import { getBrowsePrimaryBySlug } from "@/lib/stores/browse-mock/queries";
import type { BrowseSubIndustry } from "@/lib/stores/browse-mock/types";
import {
  getBrowseSubChipOptimisticSubServerSnapshot,
  getBrowseSubChipOptimisticSubSnapshot,
  setBrowseSubChipOptimisticSub,
  subscribeBrowseSubChipOptimisticSub,
} from "@/lib/stores/browse-sub-chip-navigation";
import {
  resolveBrowseMatchedSubSlug,
  resolveBrowseSubChipActiveSlug,
} from "@/lib/stores/browse-header-sub-selection";
import { useBrowseSubAllCanonicalUrl } from "@/lib/stores/use-browse-sub-all-canonical-url";
import { useBrowseSubIndustries } from "@/lib/stores/use-browse-sub-industries";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";
import { storeSecondaryBrowseIconPath } from "@/lib/stores/store-secondary-browse-icons";
import {
  resolveStoreTaxonomyImageSrc,
  storeTaxonomyUploadedImageUrl,
} from "@/lib/stores/store-taxonomy-image-src";
import { STORES_HOME_TAXONOMY_EAGER_ICON_COUNT } from "@/lib/stores/stores-home-taxonomy-seed";
import { STORES_HOME_SUB_CATEGORY_SLIDE_MS } from "@/lib/stores/stores-home-sub-category-slide";
import { STORES_HOME_HEADER_BROWSE_SUB_CHIPS_ROW_CLASS } from "@/lib/design/stores-home-header-chrome";
import {
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
  STORES_HOME_SUB_CATEGORY_RAIL,
  STORES_HOME_SUB_CATEGORY_SLIDE_LAYER,
  STORES_HOME_SUB_CATEGORY_SLIDE_STAGE,
} from "@/lib/stores/stores-home-ui";

const RESTAURANT_SUB_ICON: Record<string, string> = {
  korean: "/icons/food/icon_0_1.png",
  chinese: "/icons/food/icon_1_0.png",
  japanese: "/icons/food/icon_1_1.png",
  western: "/icons/food/icon_1_2.png",
  pizza: "/icons/food/icon_1_2.png",
  snack: "/icons/food/icon_1_3.png",
  chicken: "/icons/food/icon_0_2.png",
  lunchbox: "/icons/food/icon_2_0.png",
  local: "/icons/food/icon_2_1.png",
  dessert: "/icons/food/icon_2_2.png",
  late_night: "/icons/food/icon_2_3.png",
};

function BrowseSubCategoryRail({
  primarySlug,
  subs,
  language,
  activeSub,
  ariaLabel,
  onSubNavigate,
}: {
  primarySlug: string;
  subs: BrowseSubIndustry[];
  language: "ko" | "en";
  activeSub: string | null;
  ariaLabel: string;
  onSubNavigate: (slug: string, href: string) => void;
}) {
  const isRestaurant = primarySlug.trim().toLowerCase() === "restaurant";

  return (
    <HorizontalDragScroll
      className={STORES_HOME_SUB_CATEGORY_RAIL}
      style={{ WebkitOverflowScrolling: "touch" }}
      aria-label={ariaLabel}
    >
      {subs.map((s, idx) => {
        const on = !!activeSub && activeSub === s.slug;
        const label = resolveStoreTopicLabel(
          language,
          s.slug,
          String(s.nameKo ?? "").trim(),
          s.name_en,
        );
        const uploaded = storeTaxonomyUploadedImageUrl(s.imageUrl);
        const slugKey = String(s.slug ?? "").trim().toLowerCase();
        const iconSrc = resolveStoreTaxonomyImageSrc(
          uploaded,
          isRestaurant ? (RESTAURANT_SUB_ICON[slugKey] ?? null) : storeSecondaryBrowseIconPath(primarySlug, idx + 1),
        );
        const href = storesBrowsePath(primarySlug, s.slug);
        return (
          <Link
            key={s.id}
            href={href}
            prefetch={false}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={`${STORES_HOME_SUB_CATEGORY_LINK} ${on ? "opacity-100" : "opacity-90"}`}
            onClick={() => {
              if (on) return;
              onSubNavigate(s.slug, href);
            }}
          >
            <span className={STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}>
              {iconSrc ?
                <StoreTaxonomyThumb
                  src={iconSrc}
                  alt=""
                  isUploaded={!!uploaded}
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
            <span
              className={`${STORES_HOME_SUB_CATEGORY_LABEL} ${on ? "font-bold text-[color:var(--delivery-text-main)]" : ""}`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </HorizontalDragScroll>
  );
}

/**
 * browse 헤더 4단 — `/stores` 홈과 동일 2차 크기·1차 전환 360ms 좌→우 슬라이드
 */
export function StoresBrowseHeaderSubTopicChips({ primarySlug }: { primarySlug: string }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taxonomy = useBrowseTaxonomySnapshot();
  const subs = useBrowseSubIndustries(primarySlug);

  useBrowseSubAllCanonicalUrl(primarySlug, subs);

  const prevSlugRef = useRef(primarySlug);
  const prevSubsRef = useRef(subs);
  const [slideTransition, setSlideTransition] = useState<{
    fromSlug: string;
    toSlug: string;
    fromSubs: BrowseSubIndustry[];
    toSubs: BrowseSubIndustry[];
  } | null>(null);

  const trimmedBrowseSubParam = useMemo(() => {
    const sp = searchParams?.get("sub");
    return sp?.trim().toLowerCase() ?? "";
  }, [searchParams]);

  const matchedTopicSlug = useMemo(
    () => resolveBrowseMatchedSubSlug(trimmedBrowseSubParam, subs),
    [trimmedBrowseSubParam, subs],
  );

  const optimisticSub = useSyncExternalStore(
    subscribeBrowseSubChipOptimisticSub,
    getBrowseSubChipOptimisticSubSnapshot,
    getBrowseSubChipOptimisticSubServerSnapshot,
  );

  const activeSub = resolveBrowseSubChipActiveSlug(optimisticSub, matchedTopicSlug);

  const primaryReady = useMemo(() => {
    if (!taxonomy?.categories.length) return !!getBrowsePrimaryBySlug(primarySlug);
    const pk = primarySlug.trim().toLowerCase();
    return taxonomy.categories.some((x) => String(x.slug ?? "").trim().toLowerCase() === pk);
  }, [primarySlug, taxonomy]);

  useLayoutEffect(() => {
    if (prevSlugRef.current === primarySlug) {
      prevSubsRef.current = subs;
      return;
    }
    setSlideTransition({
      fromSlug: prevSlugRef.current,
      toSlug: primarySlug,
      fromSubs: prevSubsRef.current,
      toSubs: subs,
    });
    prevSlugRef.current = primarySlug;
    prevSubsRef.current = subs;
    const id = window.setTimeout(() => setSlideTransition(null), STORES_HOME_SUB_CATEGORY_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [primarySlug, subs]);

  const onSubNavigate = (slug: string, href: string) => {
    setBrowseSubChipOptimisticSub(storesBrowseNavSubSlug(slug));
    startTransition(() => router.push(href, { scroll: false }));
  };

  if (!primaryReady || (subs.length === 0 && !slideTransition)) return null;

  const subAria = t("store_sub_industry_aria");
  const routePrimary = pathname?.match(/^\/stores\/browse\/([^/?]+)/)?.[1]?.trim().toLowerCase() ?? "";

  return (
    <div className={`${STORES_HOME_HEADER_BROWSE_SUB_CHIPS_ROW_CLASS} px-[var(--delivery-page-x)]`}>
      <div className={STORES_HOME_SUB_CATEGORY_SLIDE_STAGE}>
        {slideTransition ?
          <>
            <div
              className={`${STORES_HOME_SUB_CATEGORY_SLIDE_LAYER} stores-browse-sub-slide-out absolute inset-x-0 top-0`}
            >
              <BrowseSubCategoryRail
                primarySlug={slideTransition.fromSlug}
                subs={slideTransition.fromSubs}
                language={language}
                activeSub={routePrimary === slideTransition.fromSlug.toLowerCase() ? activeSub : null}
                ariaLabel={subAria}
                onSubNavigate={onSubNavigate}
              />
            </div>
            <div className={`${STORES_HOME_SUB_CATEGORY_SLIDE_LAYER} stores-browse-sub-slide-in relative`}>
              <BrowseSubCategoryRail
                primarySlug={slideTransition.toSlug}
                subs={slideTransition.toSubs}
                language={language}
                activeSub={routePrimary === slideTransition.toSlug.toLowerCase() ? activeSub : null}
                ariaLabel={subAria}
                onSubNavigate={onSubNavigate}
              />
            </div>
          </>
        : <div className={STORES_HOME_SUB_CATEGORY_SLIDE_LAYER}>
            <BrowseSubCategoryRail
              primarySlug={primarySlug}
              subs={subs}
              language={language}
              activeSub={activeSub}
              ariaLabel={subAria}
              onSubNavigate={onSubNavigate}
            />
          </div>
        }
      </div>
    </div>
  );
}
