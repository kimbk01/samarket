"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { storesBrowseAllPath } from "@/components/stores/browse/stores-browse-paths";
import { setBrowseSubChipOptimisticSub } from "@/lib/stores/browse-sub-chip-navigation";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";

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
 * browse 헤더 3단 — 1차 업종 균등 텍스트 탭(8칸) + ▼
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

  const activeSlug = useMemo(() => {
    const m = pathname?.match(/^\/stores\/browse\/([^/?]+)/);
    return m?.[1]?.trim().toLowerCase() ?? null;
  }, [pathname]);

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
            return (
              <Link
                key={p.id}
                href={storesBrowseAllPath(p.slug)}
                prefetch={false}
                scroll={false}
                role="tab"
                aria-selected={on}
                className={`stores-browse-header-primary-tab ${on ? "stores-browse-header-primary-tab--active" : ""}`}
                onClick={() => {
                setBrowseSubChipOptimisticSub(null);
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
