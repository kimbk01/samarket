"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePath, storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { fetchStoresTaxonomyDeduped, prewarmStoresBrowseListClient } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { storeSecondaryBrowseIconPath } from "@/lib/stores/store-secondary-browse-icons";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStorePrimaryIndustryLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import {
  resolveStoreTaxonomyImageSrc,
  storeTaxonomyUploadedImageUrl,
} from "@/lib/stores/store-taxonomy-image-src";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import {
  STORE_BROWSE_PRIMARY_TABLIST,
  STORE_BROWSE_PRIMARY_TAB_BUTTON,
  STORE_BROWSE_PRIMARY_TAB_LABEL,
  STORE_BROWSE_SECTION_TITLE,
  STORE_BROWSE_SUB_CARD,
  STORE_BROWSE_SUB_CARD_LABEL,
} from "@/components/stores/store-browse-category-ui";

const FOOD_CATEGORIES: readonly { icon: string; subSlug?: string }[] = [
  { icon: "/icons/food/icon_0_0.png" },
  { icon: "/icons/food/icon_0_1.png", subSlug: "korean" },
  { icon: "/icons/food/icon_0_2.png", subSlug: "chicken" },
  { icon: "/icons/food/icon_0_3.png", subSlug: "western" },
  { icon: "/icons/food/icon_1_0.png", subSlug: "chinese" },
  { icon: "/icons/food/icon_1_1.png", subSlug: "japanese" },
  { icon: "/icons/food/icon_1_2.png", subSlug: "pizza" },
  { icon: "/icons/food/icon_1_3.png", subSlug: "snack" },
  { icon: "/icons/food/icon_2_0.png", subSlug: "lunchbox" },
  { icon: "/icons/food/icon_2_1.png", subSlug: "local" },
  { icon: "/icons/food/icon_2_2.png", subSlug: "dessert" },
  { icon: "/icons/food/icon_2_3.png", subSlug: "late_night" },
] as const;

const PRIMARY_CATEGORY_ICONS: Record<string, string> = {
  restaurant: "/icons/category/category_0_1.png",
  mart: "/icons/category/category_0_2.png",
  hardware: "/icons/category/category_0_3.png",
  pet: "/icons/category/category_0_4.png",
  cafe: "/icons/category/category_0_5.png",
  beauty: "/icons/category/category_0_6.png",
  academy: "/icons/category/category_0_7.png",
  life: "/icons/category/category_0_8.png",
};

/**
 * 매장 홈 — 배달 플랫폼형: 대분류 탭(한 줄) + 선택 업종의 세부만 그리드로 노출.
 * 긴 세로 반복 카드·이중 칩 스크롤 제거로 모바일 스크롤 부담 감소.
 * 앵커: `store-industry-explore`
 */
export function StoreCategoryExploreSection({
  headerTrailing,
}: {
  headerTrailing?: ReactNode;
}) {
  const { t, safeT, language } = useI18n();
  const pathname = usePathname() ?? "";
  const isStoresHubRoot = pathname === "/stores" || pathname === "/stores/";
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const industryVersion = useBrowseIndustryDatasetVersion();
  const [taxonomy, setTaxonomy] = useState<{
    categories: StoreTaxonomyCategory[];
    topics: StoreTaxonomyTopic[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        const j = jRaw as { ok?: boolean; categories?: unknown; topics?: unknown };
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({
            categories: j.categories as StoreTaxonomyCategory[],
            topics: j.topics as StoreTaxonomyTopic[],
          });
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) setTaxonomy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaries = useMemo(() => {
    // DB taxonomy가 비어있으면 기존(목업) 업종으로 폴백
    if (!taxonomy || taxonomy.categories.length === 0) return listBrowsePrimaryIndustries();
    return taxonomy.categories;
  }, [taxonomy, industryVersion]);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  const activeSlug = useMemo(() => {
    if (pickedSlug && primaries.some((p) => p.slug === pickedSlug)) return pickedSlug;
    return primaries[0]?.slug ?? "restaurant";
  }, [pickedSlug, primaries]);

  useLayoutEffect(() => {
    if (pickedSlug && !primaries.some((p) => p.slug === pickedSlug)) {
      setPickedSlug((prev) => (prev === null ? prev : null));
    }
  }, [pickedSlug, primaries]);

  const activePrimary = primaries.find((p) => p.slug === activeSlug) as any;

  const prewarmBrowseForSlug = useCallback(
    (subSlug?: string | null) => {
      const q = new URLSearchParams();
      q.set("primary", activeSlug.trim().toLowerCase());
      const sub = (subSlug ?? "all").trim().toLowerCase();
      q.set("sub", sub || "all");
      prewarmStoresBrowseListClient(q.toString(), { language });
    },
    [activeSlug, language]
  );

  const subs = useMemo(() => {
    if (!activePrimary) return [];
    // DB taxonomy가 없으면 목업 subs로 폴백
    if (!taxonomy || taxonomy.categories.length === 0) return listBrowseSubIndustries(activeSlug);
    const catId = String(activePrimary.id ?? "").trim();
    if (!catId) return [];
    return taxonomy.topics
      .filter((t) => t.store_category_id === catId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [taxonomy, activePrimary, activeSlug, industryVersion]);
  const isRestaurant = activeSlug === "restaurant";
  const activeCategoryImageUrl = storeTaxonomyUploadedImageUrl(
    (activePrimary as StoreTaxonomyCategory | undefined)?.image_url
  );
  const topicImageBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subs) {
      const u = storeTaxonomyUploadedImageUrl((s as StoreTaxonomyTopic).image_url);
      if (u) m.set(String(s.slug ?? "").trim().toLowerCase(), u);
    }
    return m;
  }, [subs]);
  const secondaryBrowseAllIconSrc = resolveStoreTaxonomyImageSrc(
    activeCategoryImageUrl,
    !isRestaurant ? storeSecondaryBrowseIconPath(activeSlug, 0) : isRestaurant ? "/icons/food/icon_0_0.png" : null
  );

  const primaryIndustryTablist = useMemo(
    () => (
      <div
        role="tablist"
        aria-label={t("store_primary_industry_aria")}
        className={STORE_BROWSE_PRIMARY_TABLIST}
      >
        {primaries.map((p) => {
          const on = p.slug === activeSlug;
          const uploaded = storeTaxonomyUploadedImageUrl((p as StoreTaxonomyCategory).image_url);
          const icon = resolveStoreTaxonomyImageSrc(uploaded, PRIMARY_CATEGORY_ICONS[p.slug] ?? null) ?? "";
          const iconIsUploaded = !!uploaded;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPickedSlug((prev) => (prev === p.slug ? prev : p.slug))}
              className={`${STORE_BROWSE_PRIMARY_TAB_BUTTON} ${
                on ? "text-sam-fg dark:text-[#E4E6EB]" : "text-sam-muted dark:text-[#B0B3B8]"
              }`}
            >
              {icon ? (
                <StoreTaxonomyThumb src={icon} isUploaded={iconIsUploaded} dimmed={!on} />
              ) : (
                <span className="text-xl leading-none opacity-80" aria-hidden>
                  {p.slug === "restaurant"
                    ? "🍽️"
                    : p.slug === "mart"
                      ? "🛒"
                      : p.slug === "hardware"
                        ? "🔧"
                        : p.slug === "pet"
                          ? "🐾"
                          : p.slug === "cafe"
                            ? "☕"
                            : p.slug === "beauty"
                              ? "💇"
                              : p.slug === "academy"
                                ? "📚"
                                : p.slug === "life"
                                  ? "🧹"
                                  : "🏷️"}
                </span>
              )}
              <span className={STORE_BROWSE_PRIMARY_TAB_LABEL}>
                {resolveStorePrimaryIndustryLabel(
                  language,
                  p.slug,
                  String((p as { nameKo?: string; name?: string }).nameKo ?? (p as { name?: string }).name ?? ""),
                  (p as { name_en?: string | null; name?: string }).name_en,
                )}
              </span>
              <span
                className="mt-1 h-1 w-10 rounded-full"
                style={{ backgroundColor: on ? "var(--delivery-primary)" : "transparent" }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    ),
    [activeSlug, language, primaries, t]
  );

  const storesHubStickyBelow = useMemo(
    () => (
      <div className="border-b border-sam-border bg-[color:var(--delivery-header-bar-bg)] dark:border-[#3E4042]">
        <div className="bg-[color:var(--delivery-header-bar-bg)] dark:bg-[#242526]">
          <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pb-1 pt-0.5`}>
            {primaryIndustryTablist}
          </div>
        </div>
      </div>
    ),
    [primaryIndustryTablist]
  );

  /** `/stores` 홈은 `StoresHomeHub` 가 LocationBar+SearchCta 만 stickyBelow 등록 — 업종 탭 금지 */
  useLayoutEffect(() => {
    if (!setMainTier1Extras || isStoresHubRoot) return;
    setMainTier1Extras({ stickyBelow: storesHubStickyBelow });
    return () => setMainTier1Extras(null);
  }, [isStoresHubRoot, setMainTier1Extras, storesHubStickyBelow]);

  return (
    <section
      id="store-industry-explore"
      className={isStoresHubRoot ? "scroll-mt-[calc(var(--sam-header-row-height)+4.5rem)]" : "scroll-mt-4"}
    >
      <div className={`overflow-hidden rounded-sam-md border border-sam-border bg-sam-surface shadow-sam-elevated dark:border-[#3E4042] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-sam-surface/[0.08]`}>
        {!isStoresHubRoot ? primaryIndustryTablist : null}

        <div className={`flex items-center justify-between gap-2 px-4 py-3 ${FB.hairline} border-b border-sam-border dark:border-[#3E4042]`}>
          <p className={`min-w-0 sam-text-body-secondary ${FB.meta}`}>
            <span className={`${STORE_BROWSE_SECTION_TITLE} text-sam-fg dark:text-[#E4E6EB]`}>
              {resolveStorePrimaryIndustryLabel(
                language,
                activeSlug,
                String(activePrimary?.nameKo ?? activePrimary?.name ?? "").trim() || t("store_browse_primary_fallback"),
                (activePrimary as { name_en?: string | null })?.name_en,
              )}
            </span>
            <span className="text-sam-muted dark:text-[#B0B3B8]">{t("store_subtopic_suffix")}</span>
          </p>
          <Link
            href={storesBrowsePrimaryPath(activeSlug)}
            className={`shrink-0 sam-text-body-secondary font-semibold ${FB.link}`}
            onPointerDown={() => prewarmBrowseForSlug(null)}
          >
            {t("store_browse_view_all")}
          </Link>
        </div>

        {isRestaurant ? (
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
            {FOOD_CATEGORIES.filter((cat) => {
              if (!cat.subSlug) return true;
              return subs.some((s) => s.slug === cat.subSlug);
            }).map((cat) => {
              const label = resolveStoreFoodSubtopicLabel(language, cat.subSlug, "");
              const href =
                !cat.subSlug ? storesBrowsePrimaryPath(activeSlug) : storesBrowsePath(activeSlug, cat.subSlug);
              const topicUploaded =
                cat.subSlug ? topicImageBySlug.get(cat.subSlug.trim().toLowerCase()) ?? "" : activeCategoryImageUrl;
              const src = resolveStoreTaxonomyImageSrc(topicUploaded, cat.icon) ?? cat.icon;
              const srcIsUploaded = !!topicUploaded;
              return (
                <Link
                  key={cat.subSlug ?? "all"}
                  href={href}
                  className={STORE_BROWSE_SUB_CARD}
                  onPointerDown={() => prewarmBrowseForSlug(cat.subSlug ?? null)}
                >
                  <StoreTaxonomyThumb src={src} alt={label} isUploaded={srcIsUploaded} />
                  <span className={STORE_BROWSE_SUB_CARD_LABEL}>{label}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
            <Link
              href={storesBrowsePrimaryPath(activeSlug)}
              className={STORE_BROWSE_SUB_CARD}
              onPointerDown={() => prewarmBrowseForSlug(null)}
            >
              {secondaryBrowseAllIconSrc ? (
                <StoreTaxonomyThumb
                  src={secondaryBrowseAllIconSrc}
                  isUploaded={!!activeCategoryImageUrl}
                />
              ) : null}
              <span className="block w-full truncate text-center text-[10px] font-semibold leading-[1.2] text-sam-muted dark:text-[#B0B3B8]">
                {t("store_collect_view")}
              </span>
              <span className={`${STORE_BROWSE_SUB_CARD_LABEL} font-bold`}>
                {safeT("store_browse_food_all")}
              </span>
            </Link>
            {subs.map((s, idx) => {
              const uploaded = storeTaxonomyUploadedImageUrl((s as StoreTaxonomyTopic).image_url);
              const src = resolveStoreTaxonomyImageSrc(uploaded, storeSecondaryBrowseIconPath(activeSlug, idx + 1));
              const label = resolveStoreTopicLabel(
                language,
                s.slug,
                String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim(),
                (s as { name_en?: string | null }).name_en,
              );
              return (
                <Link
                  key={s.id}
                  href={storesBrowsePath(activeSlug, s.slug)}
                  className={STORE_BROWSE_SUB_CARD}
                  onPointerDown={() => prewarmBrowseForSlug(s.slug)}
                >
                  {src ? <StoreTaxonomyThumb src={src} alt={label} isUploaded={!!uploaded} /> : null}
                  <span className={STORE_BROWSE_SUB_CARD_LABEL}>{label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
