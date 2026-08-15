"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
import {
  onBrowsePrimaryTaxonomyCommit,
  onBrowsePrimaryTaxonomyPointerDown,
} from "@/lib/stores/stores-browse-taxonomy-interaction";
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

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
 * browse page-nav — 1차 업종 tabs (DIBAY secondary visual SSOT).
 * Handlers/navigation unchanged. Trailing ▼ remains supplement overlay.
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
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!optimisticPrimary || !pathnamePrimarySlug) return;
    if (pathnamePrimarySlug === optimisticPrimary) {
      setBrowsePrimaryTabOptimisticSlug(null);
    }
  }, [optimisticPrimary, pathnamePrimarySlug]);

  useLayoutEffect(() => {
    if (!activeSlug || !trackRef.current) return;
    const activeTab = trackRef.current.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    );
    activeTab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
  }, [activeSlug, primaries.length]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <HorizontalDragScroll
        className={`${DIBAY_SECONDARY_TABS_CLASS} min-w-0 flex-1 border-b-0 bg-transparent px-0`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          ref={trackRef}
          className="flex min-w-0 flex-nowrap items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]"
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
                aria-busy={pending || undefined}
                className={dibaySecondaryTabClass(on)}
                onPointerDown={(e) => {
                  onBrowsePrimaryTaxonomyPointerDown({
                    ev: e,
                    primarySlug: slug,
                    language,
                    primaryRegion,
                  });
                }}
                onClick={() => {
                  onBrowsePrimaryTaxonomyCommit(slug);
                  onMenuOpenChange(false);
                }}
              >
                {resolveStorePrimaryIndustryLabel(
                  language,
                  p.slug,
                  p.nameKo,
                  p.name_en ?? p.nameEn,
                )}
              </Link>
            );
          })}
        </div>
      </HorizontalDragScroll>
      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--sector-header-title-color,#243832)] hover:bg-black/5"
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
