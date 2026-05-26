"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { STORE_CATEGORY_PILL_SCROLL } from "@/components/stores/store-category-pill-styles";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";

function pillClass(active: boolean): string {
  return `${active ? "delivery-category-chip delivery-category-chip--active" : "delivery-category-chip"} inline-flex items-center gap-1`;
}

/**
 * 대분류 업종 가로 이동 — 식당만 강조되지 않도록 전 업종 동일 패턴.
 * `/stores` 에서는 `embeddedPrimarySlug` 없이 pathname 만으로 활성 처리.
 */
export function StorePrimaryIndustrySwitcher({
  embeddedPrimarySlug,
  showHomeChip = true,
}: {
  embeddedPrimarySlug?: string | null;
  /** browse 상단에서는 매장 홈 칩을 숨기고 업종만 촘촘히 */
  showHomeChip?: boolean;
}) {
  const { t, language } = useI18n();
  const industryVersion = useBrowseIndustryDatasetVersion();
  const pathname = usePathname();
  const [taxonomyCats, setTaxonomyCats] = useState<StoreTaxonomyCategory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        const j = jRaw as { ok?: boolean; categories?: unknown };
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.categories)) {
          setTaxonomyCats(j.categories as StoreTaxonomyCategory[]);
        } else {
          setTaxonomyCats(null);
        }
      } catch {
        if (!cancelled) setTaxonomyCats(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaries = useMemo(() => {
    if (!taxonomyCats || taxonomyCats.length === 0) return listBrowsePrimaryIndustries();
    // DB taxonomy에는 symbol이 없으므로, 기존 목록에서 slug 매칭으로 symbol/표시명 보강
    const fallback = listBrowsePrimaryIndustries();
    const bySlug = new Map(fallback.map((p) => [p.slug, p]));
    return taxonomyCats.map((c) => {
      const fb = bySlug.get(c.slug);
      return {
        id: c.id,
        slug: c.slug,
        nameKo: c.name,
        name_en: c.name_en,
        sortOrder: c.sort_order,
        symbol: fb?.symbol ?? "🏷️",
      };
    });
  }, [taxonomyCats, industryVersion]);

  const activeSlug = useMemo(() => {
    const fromProp = embeddedPrimarySlug?.trim().toLowerCase();
    if (fromProp) return fromProp;
    const m = pathname.match(/^\/stores\/browse\/([^/?]+)/);
    return m?.[1]?.trim().toLowerCase() ?? null;
  }, [pathname, embeddedPrimarySlug]);

  const onStoresHome = pathname === "/stores" || pathname === "/stores/";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className={`${FB.metaSm} font-semibold uppercase tracking-wide`}>
          {t("store_primary_industry_aria")}
        </p>
        {!showHomeChip ?
          <Link href="/stores" prefetch={false} className={`shrink-0 sam-text-helper ${FB.link}`}>
            {t("store_stores_home")}
          </Link>
        : null}
      </div>
      <HorizontalDragScroll
        className={STORE_CATEGORY_PILL_SCROLL}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label={t("store_primary_industry_aria")}
      >
        {showHomeChip ?
          <Link href="/stores" prefetch={false} className={pillClass(onStoresHome && activeSlug == null)}>
            {t("common_homepage")}
          </Link>
        : null}
        {primaries.map((p) => {
          const slug = p.slug.toLowerCase();
          const on = activeSlug === slug;
          return (
            <Link
              key={p.id}
              href={storesBrowsePrimaryPath(p.slug)}
              prefetch={false}
              scroll={false}
              className={`${pillClass(on)} max-w-[9.5rem]`}
            >
              <span aria-hidden className="shrink-0">
                {p.symbol}
              </span>
              <span className="min-w-0 truncate text-[12px] leading-none">
                {resolveStorePrimaryIndustryLabel(language, p.slug, p.nameKo, (p as { name_en?: string | null }).name_en)}
              </span>
            </Link>
          );
        })}
      </HorizontalDragScroll>
    </div>
  );
}
