"use client";

/**
 * HOME store teaser horizontal — wide store card with NEW badge emphasis.
 */

import Link from "next/link";
import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

function StoresHomeStoreTeaserCardInner({
  entry,
  imageUrl,
  loadingImage,
  benefit,
}: {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
  benefit?: StoresHomeShelfCardBenefit;
}) {
  const { t } = useI18n();
  const href = `/stores/${encodeURIComponent(entry.storeSlug)}`;
  const warm = () => deliveryStoreMenusPrewarm(entry.storeSlug, { force: true });

  return (
    <Link
      href={href}
      prefetch={false}
      data-stores-home-presentation="store_teaser_horizontal"
      data-stores-home-store-teaser-card="true"
      onPointerDown={warm}
      onFocus={warm}
      className={`flex w-[11.5rem] shrink-0 flex-col overflow-hidden ${STORES_HOME_CARD}`}
    >
      <div className="relative aspect-[16/10] w-full bg-[color:var(--delivery-bg-thumb)]">
        {loadingImage ?
          <div className="absolute inset-0 bg-[color:var(--delivery-bg-muted)]" aria-hidden />
        : imageUrl ?
          <StoreProductThumbnail
            src={imageUrl}
            alt={entry.storeName}
            fill
            fetchPreset="hubFood"
            className="absolute inset-0"
            imageClassName="h-full w-full object-cover"
            roundedClassName="rounded-none"
            loading="lazy"
          />
        : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-[color:var(--delivery-text-muted)]">
            {entry.storeName.slice(0, 1)}
          </div>
        )}
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[4px] bg-sam-success px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {t("store_badge_new_store")}
        </span>
        {benefit?.imageBadgeLabel ?
          <span
            className={`pointer-events-none absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${benefit.imageBadgeClassName ?? "bg-black/55 text-white"}`}
          >
            {benefit.imageBadgeLabel}
          </span>
        : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-1 text-[13px] font-semibold text-[color:var(--delivery-text-main)]">{entry.storeName}</p>
        {benefit?.benefitLine ?
          <p className="line-clamp-1 text-[11.5px] font-medium text-signature">{benefit.benefitLine}</p>
        : entry.etaLabel ?
          <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.etaLabel}</p>
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeStoreTeaserCard = memo(StoresHomeStoreTeaserCardInner);
