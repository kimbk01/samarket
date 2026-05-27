"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import {
  STORE_BROWSE_SUB_CARD,
  STORE_BROWSE_SUB_CARD_LABEL,
} from "@/components/stores/store-browse-category-ui";
import { useRegionOptional } from "@/contexts/RegionContext";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import {
  resolveBrowsePrimaryIndustryIcon,
  type BrowsePrimaryIndustryWithImage,
} from "@/lib/stores/browse-primary-industry-display";
import {
  onBrowsePrimaryTaxonomyCommit,
  onBrowsePrimaryTaxonomyPointerDown,
} from "@/lib/stores/stores-browse-taxonomy-interaction";

/** browse 1차 ▼ 패널 — `/stores` 그리드 카드형 */
export function BrowsePrimaryIndustryMenuCard({
  p,
  active,
  href,
  onNavigate,
}: {
  p: BrowsePrimaryIndustryWithImage;
  active: boolean;
  href: string;
  onNavigate?: () => void;
}) {
  const { language } = useI18n();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const icon = resolveBrowsePrimaryIndustryIcon(p);
  const labelText = resolveStorePrimaryIndustryLabel(
    language,
    p.slug,
    p.nameKo,
    p.name_en ?? p.nameEn,
  );
  const slug = p.slug.toLowerCase();

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
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
        onNavigate?.();
      }}
      className={`${STORE_BROWSE_SUB_CARD} ${
        active ? "border-[color:var(--delivery-primary)] ring-1 ring-[color:var(--delivery-primary)]" : ""
      }`}
    >
      {icon ?
        <StoreTaxonomyThumb src={icon.src} alt={labelText} isUploaded={icon.isUploaded} dimmed={!active} />
      : null}
      <span className={STORE_BROWSE_SUB_CARD_LABEL}>{labelText}</span>
    </Link>
  );
}
