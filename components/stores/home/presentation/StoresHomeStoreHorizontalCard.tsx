"use client";

/**
 * HOME store-focused horizontal card — store entity, not product food card.
 */

import Link from "next/link";
import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryAdCustomerAdTag } from "@/components/stores/advertising/DeliveryAdCustomerAdTag";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_CARD, STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

function StoresHomeStoreHorizontalCardInner({
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
      data-stores-home-presentation="store_horizontal"
      data-stores-home-store-horizontal-card="true"
      onPointerDown={warm}
      onFocus={warm}
      className={`flex w-[9.5rem] shrink-0 flex-col overflow-hidden ${STORES_HOME_CARD}`}
    >
      <div className="relative aspect-[4/3] w-full bg-[color:var(--delivery-bg-thumb)]">
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
          <div className="flex h-full items-center justify-center text-[11px] text-[color:var(--delivery-text-muted)]">
            {entry.storeName.slice(0, 1)}
          </div>
        )}
        {benefit?.imageBadgeLabel ?
          <span
            className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${benefit.imageBadgeClassName ?? "bg-black/55 text-white"}`}
          >
            {benefit.imageBadgeLabel}
          </span>
        : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-2 text-[13px] font-semibold leading-[1.05] text-[color:var(--delivery-text-main)]">
          {entry.storeName}
        </p>
        {entry.rating > 0 ?
          <p className={`text-[12.5px] font-bold ${STORES_HOME_META}`}>
            ★ {entry.rating.toFixed(1)}
          </p>
        : null}
        {benefit?.benefitLine ?
          <p className="line-clamp-2 text-[11.5px] font-medium text-signature">{benefit.benefitLine}</p>
        : entry.deliveryFeeLabel ?
          <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.deliveryFeeLabel}</p>
        : null}
        {entry.etaLabel ?
          <p className={`line-clamp-1 text-[12.5px] ${STORES_HOME_META}`}>{entry.etaLabel}</p>
        : null}
        {benefit?.sponsored ?
          <DeliveryAdCustomerAdTag label={t("store_insertion_sponsored")} />
        : null}
      </div>
    </Link>
  );
}

export const StoresHomeStoreHorizontalCard = memo(StoresHomeStoreHorizontalCardInner);
