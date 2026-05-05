"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePath, storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

const FOOD_CATEGORIES: readonly { name: string; icon: string; subSlug?: string }[] = [
  { name: "전체", icon: "/icons/food/icon_0_0.png" },
  { name: "한식", icon: "/icons/food/icon_0_1.png", subSlug: "korean" },
  { name: "치킨·고기", icon: "/icons/food/icon_0_2.png", subSlug: "chicken" },
  { name: "면·국물", icon: "/icons/food/icon_0_3.png", subSlug: "snack" },

  { name: "중식", icon: "/icons/food/icon_1_0.png", subSlug: "chinese" },
  { name: "일식", icon: "/icons/food/icon_1_1.png", subSlug: "japanese" },
  { name: "피자·양식", icon: "/icons/food/icon_1_2.png", subSlug: "pizza" },
  { name: "분식", icon: "/icons/food/icon_1_3.png", subSlug: "snack" },

  { name: "도시락", icon: "/icons/food/icon_2_0.png", subSlug: "lunchbox" },
  { name: "현지식", icon: "/icons/food/icon_2_1.png", subSlug: "local" },
  { name: "카페·디저트", icon: "/icons/food/icon_2_2.png", subSlug: "dessert" },
  { name: "야식", icon: "/icons/food/icon_2_3.png", subSlug: "late_night" },
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
  const subs = useMemo(() => {
    if (!activePrimary) return [];
    // DB taxonomy가 없으면 목업 subs로 폴백
    if (!taxonomy || taxonomy.categories.length === 0) return listBrowseSubIndustries(activeSlug);
    const catId = String(activePrimary.id ?? "").trim();
    if (!catId) return [];
    return taxonomy.topics.filter((t) => t.store_category_id === catId);
  }, [taxonomy, activePrimary, activeSlug, industryVersion]);
  const isRestaurant = activeSlug === "restaurant";

  return (
    <section id="store-industry-explore" className="scroll-mt-4">
      <div className={`overflow-hidden rounded-sam-md border border-sam-border bg-sam-surface shadow-sam-elevated dark:border-[#3E4042] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-sam-surface/[0.08]`}>
        <div className={`flex items-start justify-between gap-2 border-b border-sam-border px-4 py-4 dark:border-[#3E4042]`}>
          <div className="min-w-0">
            <h2 className={FB.name}>업종 선택</h2>
            <p className={`mt-0.5 ${FB.metaSm}`}>탭으로 대분류를 고른 뒤, 세부만 골라 들어가요.</p>
          </div>
          {headerTrailing ? <div className="shrink-0 pt-0.5">{headerTrailing}</div> : null}
        </div>

        <div
          role="tablist"
          aria-label="대분류 업종"
          className="flex snap-x snap-mandatory gap-0 overflow-x-auto overscroll-x-contain border-b border-sam-border px-0.5 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [scrollbar-gutter:stable] touch-pan-x dark:border-[#3E4042] [&::-webkit-scrollbar]:hidden"
        >
          {primaries.map((p) => {
            const on = p.slug === activeSlug;
            const icon = PRIMARY_CATEGORY_ICONS[p.slug] ?? "";
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPickedSlug((prev) => (prev === p.slug ? prev : p.slug))}
                className={`flex w-[68px] shrink-0 snap-start flex-col items-center justify-center gap-0 rounded-sam-md px-1 py-1.5 transition-[transform,background-color,color] duration-150 will-change-transform active:scale-[0.97] ${
                  on
                    ? "bg-sam-surface-muted text-sam-fg dark:bg-[#3A3B3C] dark:text-[#E4E6EB]"
                    : "text-sam-muted active:bg-sam-surface-muted dark:text-[#B0B3B8] dark:active:bg-[#4E4F50]"
                }`}
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    aria-hidden
                    className={`h-9 w-9 object-contain ${on ? "opacity-100" : "opacity-90"}`}
                    loading="lazy"
                  />
                ) : (
                  <span className="text-xl leading-none opacity-80" aria-hidden>
                    {/* DB taxonomy에는 symbol이 없으므로 slug 기반 최소 fallback */}
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
                <span
                  className={`text-[12.5px] font-semibold leading-none tracking-[-0.01em] ${
                    on ? "text-sam-fg dark:text-[#E4E6EB]" : ""
                  }`}
                >
                  {(p as any).nameKo ?? (p as any).name ?? ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className={`flex items-center justify-between gap-2 px-4 py-3 ${FB.hairline} border-b border-sam-border dark:border-[#3E4042]`}>
          <p className={`truncate sam-text-body-secondary ${FB.meta}`}>
            <span className="font-semibold text-sam-fg dark:text-[#E4E6EB]">
              {String(activePrimary?.nameKo ?? activePrimary?.name ?? "매장").trim() || "매장"}
            </span>
            <span className="text-sam-muted dark:text-[#B0B3B8]"> · 세부 주제</span>
          </p>
          <Link
            href={storesBrowsePrimaryPath(activeSlug)}
            className={`shrink-0 sam-text-body-secondary font-semibold ${FB.link}`}
          >
            전체 보기
          </Link>
        </div>

        {isRestaurant ? (
          <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4">
            {FOOD_CATEGORIES.filter((cat) => {
              if (cat.name === "전체") return true;
              if (!cat.subSlug) return false;
              return subs.some((s) => s.slug === cat.subSlug);
            }).map((cat) => {
              const href =
                cat.name === "전체" || !cat.subSlug
                  ? storesBrowsePrimaryPath(activeSlug)
                  : storesBrowsePath(activeSlug, cat.subSlug);
              return (
                <Link
                  key={cat.name}
                  href={href}
                  className="group flex min-h-[78px] flex-col items-center justify-center rounded-xl border border-sam-border bg-white p-2.5 text-center shadow-sm transition will-change-transform hover:shadow-md active:scale-[0.97] dark:border-[#3E4042] dark:bg-[#2A2B2C] dark:hover:shadow-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cat.icon}
                    alt={cat.name}
                    className="mb-1 h-12 w-12 object-contain"
                    loading="lazy"
                  />
                  <span className="text-[13px] font-medium leading-none text-gray-700 dark:text-[#E4E6EB]">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
            <Link
              href={storesBrowsePrimaryPath(activeSlug)}
              className="flex min-h-[56px] flex-col items-center justify-center rounded-sam-md border border-sam-border bg-sam-surface-muted px-2 py-2 text-center active:bg-sam-app dark:bg-[#3A3B3C] dark:active:bg-[#4E4F50]"
            >
              <span className="sam-text-xxs font-semibold text-sam-muted dark:text-[#B0B3B8]">모아보기</span>
              <span className="mt-0.5 sam-text-body-secondary font-bold text-sam-fg dark:text-[#E4E6EB]">전체</span>
            </Link>
            {subs.map((s) => (
              <Link
                key={s.id}
                href={storesBrowsePath(activeSlug, s.slug)}
                className="flex min-h-[56px] items-center justify-center rounded-sam-md border border-sam-border bg-sam-surface-muted px-2 py-2 text-center active:bg-sam-app dark:bg-[#3A3B3C] dark:active:bg-[#4E4F50]"
              >
                <span className="text-center sam-text-body-secondary font-semibold leading-tight text-sam-fg dark:text-[#E4E6EB]">
                  {(s as any).nameKo ?? (s as any).name ?? ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
