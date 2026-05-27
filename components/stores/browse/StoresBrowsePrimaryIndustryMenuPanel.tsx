"use client";

import { useEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BrowsePrimaryIndustryMenuCard } from "@/components/stores/browse/BrowsePrimaryIndustryVisual";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import { resolveBrowsePrimaryEntryHref } from "@/lib/stores/browse-taxonomy-resolvers";
import { STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_CLASS } from "@/lib/design/stores-home-header-chrome";

/**
 * 1차 탭 ▼ — 2단 하단선 인라인 그리드 (`/stores` 1차 아이콘·라벨)
 */
export function StoresBrowsePrimaryIndustryMenuPanel({
  open,
  onClose,
  primaries,
  activeSlug,
}: {
  open: boolean;
  onClose: () => void;
  primaries: BrowsePrimaryIndustryWithImage[];
  activeSlug: string | null;
}) {
  const { t } = useI18n();

  const hrefBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of primaries) {
      map.set(p.slug.toLowerCase(), resolveBrowsePrimaryEntryHref(p.slug).path);
    }
    return map;
  }, [primaries]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={STORES_HOME_HEADER_BROWSE_PRIMARY_MENU_PANEL_CLASS}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stores-browse-primary-menu-title"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--delivery-border)] px-[var(--delivery-page-x)] py-2.5">
        <h2
          id="stores-browse-primary-menu-title"
          className="text-[15px] font-bold leading-none text-[color:var(--delivery-dark)]"
        >
          {t("store_browse_primary_menu_all")}
        </h2>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--delivery-dark)] hover:bg-black/5"
          aria-label={t("common_close")}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path stroke="currentColor" strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul className="grid max-h-[min(52vh,420px)] grid-cols-3 gap-2 overflow-y-auto px-[var(--delivery-page-x)] py-3 sm:grid-cols-4">
        {primaries.map((p) => {
          const slug = p.slug.toLowerCase();
          return (
            <li key={p.id}>
              <BrowsePrimaryIndustryMenuCard
                p={p}
                active={activeSlug === slug}
                href={hrefBySlug.get(slug) ?? `/stores/browse/${encodeURIComponent(slug)}`}
                onNavigate={onClose}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
