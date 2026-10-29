"use client";

/**
 * HOME brand circular promo card — brand entity, circular logo + benefit line.
 */

import Link from "next/link";
import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { DeliveryAdCustomerAdTag } from "@/components/stores/advertising/DeliveryAdCustomerAdTag";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { STORES_HOME_META } from "@/lib/stores/stores-home-ui";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";

function StoresHomeBrandCircularCardInner({
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
  const subtitle = benefit?.benefitLine ?? entry.campaignTitle ?? entry.name;

  return (
    <Link
      href={href}
      prefetch={false}
      data-stores-home-presentation="brand_circular"
      data-stores-home-brand-circular-card="true"
      onPointerDown={warm}
      onFocus={warm}
      className="flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 text-center"
    >
      <div className="relative h-[4.75rem] w-[4.75rem] overflow-hidden rounded-full bg-[color:var(--delivery-bg-thumb)] ring-1 ring-[color:var(--delivery-border-light)]">
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
            roundedClassName="rounded-full"
            loading="lazy"
          />
        : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-[color:var(--delivery-text-muted)]">
            {entry.storeName.slice(0, 1)}
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-[color:var(--delivery-text-main)]">
        {entry.storeName}
      </p>
      {subtitle ?
        <p className={`line-clamp-2 text-[10.5px] leading-tight text-signature ${STORES_HOME_META}`}>{subtitle}</p>
      : null}
      {benefit?.sponsored ?
        <DeliveryAdCustomerAdTag label={t("store_insertion_sponsored")} />
      : null}
    </Link>
  );
}

export const StoresHomeBrandCircularCard = memo(StoresHomeBrandCircularCardInner);
