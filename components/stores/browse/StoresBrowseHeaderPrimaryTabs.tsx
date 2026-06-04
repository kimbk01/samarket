"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { storesBrowseAllPath } from "@/components/stores/browse/stores-browse-paths";
import { useRegionOptional } from "@/contexts/RegionContext";
import {
  getBrowsePrimaryTabOptimisticSlugServerSnapshot,
  getBrowsePrimaryTabOptimisticSlugSnapshot,
  resolveBrowsePrimaryTabActiveSlug,
  setBrowsePrimaryTabOptimisticSlug,
  subscribeBrowsePrimaryTabOptimisticSlug,
} from "@/lib/stores/browse-primary-tab-navigation";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import { storeCategoryPillClass } from "@/components/stores/store-category-pill-styles";
import {
  onBrowsePrimaryTaxonomyCommit,
  onBrowsePrimaryTaxonomyPointerDown,
} from "@/lib/stores/stores-browse-taxonomy-interaction";

function MenuExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      aria-hidden
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

/**
 * browse 헤더 3단 — 1차 업종 pill(`delivery-category-chip`) + ▼
 * CONTRACT: `primaries` 는 부모 `StoresBrowseHeaderChrome` 단일 `useBrowsePrimaryIndustries` 만 사용.
 */
export function StoresBrowseHeaderPrimaryTabs({
  primaries,
  menuOpen,
  onMenuOpenChange,
}: {
  primaries: BrowsePrimaryIndustryWithImage[];
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;

  const pathnamePrimarySlug = useMemo(() => {
    const m = pathname?.match(/^\/stores\/browse\/([^/?]+)/);
    return m?.[1]?.trim().toLowerCase() ?? null;
  }, [pathname]);

  const optimisticPrimary = useSyncExternalStore(
    subscribeBrowsePrimaryTabOptimisticSlug,
    getBrowsePrimaryTabOptimisticSlugSnapshot,
    getBrowsePrimaryTabOptimisticSlugServerSnapshot,
  );

  const activeSlug = resolveBrowsePrimaryTabActiveSlug(pathnamePrimarySlug, optimisticPrimary);

  useEffect(() => {
    if (!optimisticPrimary || !pathnamePrimarySlug) return;
    if (pathnamePrimarySlug === optimisticPrimary) {
      setBrowsePrimaryTabOptimisticSlug(null);
    }
  }, [optimisticPrimary, pathnamePrimarySlug]);

  return (
    <div className="stores-browse-header-primary-tabs">
      <HorizontalDragScroll
        className="stores-browse-header-primary-tabs__scroll"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="stores-browse-header-primary-tabs__track"
          role="tablist"
          aria-label={t("store_primary_industry_aria")}
        >
          {primaries.map((p) => {
            const slug = p.slug.toLowerCase();
            const on = activeSlug === slug;
            const pending = optimisticPrimary === slug && pathnamePrimarySlug !== slug;
            return (
              <Link
                key={p.id}
                href={storesBrowseAllPath(p.slug)}
                prefetch={false}
                scroll={false}
                role="tab"
                aria-selected={on}
                className={`stores-browse-header-primary-tab ${storeCategoryPillClass(on)} ${pending ? "stores-browse-header-primary-tab--pending" : ""}`}
                onPointerDown={(e) => {
                  onBrowsePrimaryTaxonomyPointerDown({
                    ev: e,
                    primarySlug: slug,
                    language,
                    primaryRegion,
                  });
                }}
                onClick={(e) => {
                  e.currentTarget.classList.add("delivery-category-chip--active");
                  e.currentTarget.classList.add("stores-browse-header-primary-tab--pending");
                  onBrowsePrimaryTaxonomyCommit(slug);
                  onMenuOpenChange(false);
                }}
              >
                <span className="stores-browse-header-primary-tab__label">
                  {resolveStorePrimaryIndustryLabel(
                    language,
                    p.slug,
                    p.nameKo,
                    p.name_en ?? p.nameEn,
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </HorizontalDragScroll>
      <button
        type="button"
        className="stores-browse-header-primary-tab-menu-btn"
        aria-label={t("store_browse_primary_menu_all")}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => onMenuOpenChange(!menuOpen)}
      >
        <MenuExpandIcon open={menuOpen} />
      </button>
    </div>
  );
}
