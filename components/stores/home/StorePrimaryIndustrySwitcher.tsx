"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import {
  STORE_CATEGORY_PILL_SCROLL,
  storeCategoryPillClass,
} from "@/components/stores/store-category-pill-styles";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

function pillClass(active: boolean): string {
  return `${storeCategoryPillClass(active)} inline-flex items-center gap-1`;
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
  const industryVersion = useBrowseIndustryDatasetVersion();
  const pathname = usePathname();
  const primaries = useMemo(() => listBrowsePrimaryIndustries(), [industryVersion]);

  const activeSlug = useMemo(() => {
    const fromProp = embeddedPrimarySlug?.trim().toLowerCase();
    if (fromProp) return fromProp;
    const m = pathname.match(/^\/stores\/browse\/([^/?]+)/);
    return m?.[1]?.trim().toLowerCase() ?? null;
  }, [pathname, embeddedPrimarySlug]);

  const onStoresHome = pathname === "/stores" || pathname === "/stores/";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className={`${FB.metaSm} font-semibold uppercase tracking-wide text-[#65676B] dark:text-[#B0B3B8]`}>
          업종
        </p>
        {!showHomeChip ?
          <Link href="/stores" className={`shrink-0 text-[12px] ${FB.link}`}>
            매장 홈
          </Link>
        : null}
      </div>
      <HorizontalDragScroll
        className={STORE_CATEGORY_PILL_SCROLL}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="대분류 업종"
      >
        {showHomeChip ?
          <Link href="/stores" className={pillClass(onStoresHome && activeSlug == null)}>
            홈
          </Link>
        : null}
        {primaries.map((p) => {
          const slug = p.slug.toLowerCase();
          const on = activeSlug === slug;
          return (
            <Link key={p.id} href={storesBrowsePrimaryPath(p.slug)} scroll={false} className={pillClass(on)}>
              <span aria-hidden>{p.symbol}</span>
              {p.nameKo}
            </Link>
          );
        })}
      </HorizontalDragScroll>
    </div>
  );
}
