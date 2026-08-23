"use client";

/**
 * HOME store teaser presentation owner (SSOT).
 * Compact store discovery — no L1 menu gallery, no payment clutter.
 * Primary CTA: whole teaser → existing store detail route.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { formatBrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import { memo, useCallback, useMemo } from "react";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";
import { useDeliverySurfaceLifecycle } from "@/components/delivery/presentation/DeliverySurfaceLifecycle";
import { useDeliveryStoreDetailViewportPrefetch } from "@/lib/dibay/use-delivery-store-detail-viewport-prefetch";
import {
  storeRowCardDataEqual,
  type StoreRowCardData,
} from "@/components/stores/home/StoreDeliveryRowCard";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import { STORES_LIST_PRESENTATION_SSOT } from "@/lib/stores/presentation/stores-list-presentation-ssot";
import { useStoreListCardNavigation } from "@/components/stores/presentation/use-store-list-card-navigation";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";

function reviewLabel(n: number) {
  if (n > 9999) return "9,999+";
  return n.toLocaleString("en-PH");
}

function distLabel(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function StoresHomeStoreTeaserCardInner({
  data,
  locale,
  deliveryRideTimeSource = "google",
  browseStoreId,
  registerBrowseListItem,
}: {
  data: StoreRowCardData;
  locale: AppLanguageCode;
  deliveryRideTimeSource?: string;
  browseStoreId?: string;
  registerBrowseListItem?: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { t } = useI18n();
  const lifecycle = useDeliverySurfaceLifecycle("browse");
  const active = lifecycle === "active";
  const viewportRef = useDeliveryStoreDetailViewportPrefetch(data.slug, active);
  const {
    prefetchStoreDetail,
    navigateToStore,
    onRowPointerWarm,
  } = useStoreListCardNavigation(data, active);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      viewportRef(node);
      const sid = browseStoreId ?? data.storeId;
      if (sid && registerBrowseListItem) registerBrowseListItem(sid, node);
    },
    [viewportRef, browseStoreId, data.storeId, registerBrowseListItem]
  );

  const d = distLabel(data.distanceKm);
  const outOfRange =
    data.distanceOutOfRange && data.maxDeliveryDistanceKm != null
      ? t("store_delivery_distance_out_of_range_with_max", { km: data.maxDeliveryDistanceKm })
      : data.distanceOutOfRange
        ? t("store_delivery_distance_out_of_range")
        : null;

  const rowLabels = useMemo(() => {
    if (!data.commerce) return null;
    return formatBrowseStoreRowLabels(locale, data.commerce, {
      deliveryAvailable: data.deliveryAvailable,
      rideMinutes: data.rideMinutes ?? null,
      routeContextPresent:
        data.straightDistanceKm != null ||
        data.distanceKm != null ||
        data.routeDistanceKm != null,
      deliveryRideTimeSource,
    });
  }, [
    locale,
    data.commerce,
    data.deliveryAvailable,
    data.rideMinutes,
    data.straightDistanceKm,
    data.distanceKm,
    data.routeDistanceKm,
    deliveryRideTimeSource,
  ]);

  const deliveryFeeUi = rowLabels?.deliveryFeeLabel ?? null;
  const timeLabel = rowLabels?.etaLabel?.trim() || null;
  const freeDeliveryProven =
    data.deliveryAvailable &&
    (deliveryFeeUi === t("store_delivery_fee_free_line") ||
      deliveryFeeUi === t("store_free_delivery_applied"));

  const statusBadge =
    data.status === "open"
      ? { label: t("store_open_now"), className: "bg-sam-success-soft text-sam-success" }
      : data.status === "resting"
        ? { label: t("store_resting_now"), className: "bg-sam-warning-soft text-sam-warning" }
        : data.status === "closed"
          ? { label: t("store_closed_now"), className: "bg-sam-surface-muted text-sam-muted" }
          : { label: t("store_preparing"), className: "bg-sam-warning-soft text-sam-warning" };

  const badges = resolveStoreListCardBadges({
    statusLabel: statusBadge.label,
    statusClassName: statusBadge.className,
    isFeatured: data.isFeatured,
    recommendedLabel: t("store_badge_recommended"),
    freeDeliveryProven,
    freeDeliveryLabel: t("store_free_delivery_short"),
    outOfRangeLabel: outOfRange,
  });

  const metaBits = [timeLabel, deliveryFeeUi, d].filter(Boolean);

  return (
    <li
      ref={setRef}
      className="list-none select-none border-b border-[var(--delivery-border-light)] bg-[var(--delivery-bg-card)] px-4 py-3"
      onPointerEnter={onRowPointerWarm}
      onFocus={onRowPointerWarm}
      data-presentation-owner={STORES_LIST_PRESENTATION_SSOT.owners.homeStore}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left transition-[transform,opacity] duration-120 active:scale-[0.985] active:opacity-95"
        onPointerDown={() => {
          deliveryStoreDetailPrewarmAll(data.slug);
          prefetchStoreDetail("pointer_down", { force: true });
        }}
        onTouchStart={() => {
          deliveryStoreDetailPrewarmAll(data.slug);
          prefetchStoreDetail("touch_start", { force: true });
        }}
        onClick={() => navigateToStore("card")}
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-[color:var(--delivery-bg-thumb)]">
          {data.profileImageUrl ?
            <StoreProductThumbnail
              src={data.profileImageUrl}
              fill
              fetchPreset="rowFeatured"
              roundedClassName="rounded-[8px]"
              className="h-full w-full"
              loading="lazy"
            />
          : (
            <div className="flex h-full w-full items-center justify-center text-[13px] font-bold text-[color:var(--delivery-text-muted)]">
              {data.nameKo.slice(0, 1)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[15px] font-semibold tracking-[-0.01em] text-[color:var(--delivery-text-main)]">
            {data.nameKo}
            {data.rating > 0 ?
              <span className={`ml-2 inline-flex items-center gap-1 align-middle text-[13px] font-bold ${FB.ratingValue}`}>
                <span className={`text-[12px] ${FB.ratingStar}`} aria-hidden>
                  ★
                </span>
                {data.rating.toFixed(1)}
                <span className={FB.ratingCount}>({reviewLabel(data.reviewCount)})</span>
              </span>
            : null}
          </h3>

          {metaBits.length > 0 ?
            <p className={`mt-1 line-clamp-1 text-[12.5px] ${FB.metaRow}`}>{metaBits.join(" · ")}</p>
          : null}

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={`${b.kind}-${b.label}`}
                className={`inline-flex h-[21px] items-center rounded-[5px] px-1.5 text-[11px] font-semibold leading-none ${b.className}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </button>
    </li>
  );
}

export const StoresHomeStoreTeaserCard = memo(
  StoresHomeStoreTeaserCardInner,
  (prev, next) =>
    prev.locale === next.locale &&
    prev.deliveryRideTimeSource === next.deliveryRideTimeSource &&
    prev.browseStoreId === next.browseStoreId &&
    prev.registerBrowseListItem === next.registerBrowseListItem &&
    storeRowCardDataEqual(prev.data, next.data)
);

StoresHomeStoreTeaserCard.displayName = "StoresHomeStoreTeaserCard";
