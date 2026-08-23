"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { StoreRowCardData } from "@/components/stores/home/StoreDeliveryRowCard";
import { dibayPerfRecordStoreCardNavigationIntent } from "@/lib/dibay/delivery-flow-perf";
import {
  deliveryShellEntryBeginNavigation,
  deliveryShellEntryMark,
  deliveryShellEntryScheduleRouterPushStart,
} from "@/lib/dibay/delivery-shell-entry-trace";
import {
  buildStoreDetailHref,
  deliveryStoreDetailPrefetch,
  deliveryStoreDetailPrefetchForTap,
} from "@/lib/dibay/delivery-store-detail-prefetch";
import { armStoreMenuFocusEntryIntent } from "@/lib/dibay/store-menu-focus-entry-intent";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import { saveDeliveryListScrollBeforeStoreNavigation } from "@/lib/dibay/delivery-list-scroll-restore";
import { writeStoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import {
  parseBrowsePrimarySlugFromPathname,
  writeStoreDetailBrowseOrigin,
  parseBrowseSubSlugFromSearch,
} from "@/lib/dibay/store-detail-browse-origin";
import { deliveryMenuVisibleBeginNavSession } from "@/lib/dibay/delivery-menu-visible-trace";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";
import {
  DELIVERY_PERF_TAG_ROUTE_TRANSITION,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

export type StoreListCardNavSource = "card" | "featured_menu" | "see_more";

/**
 * Shared navigation/prefetch for HOME/BROWSE list cards.
 * Destination authority unchanged — existing store detail (+ optional focus product).
 */
export function useStoreListCardNavigation(data: StoreRowCardData, browseActive: boolean) {
  const router = useRouter();

  const prefetchStoreDetail = useCallback(
    (
      source: Parameters<typeof deliveryStoreDetailPrefetch>[2],
      opts?: { force?: boolean; focusProductId?: string | null }
    ) => {
      if (!browseActive) return;
      deliveryStoreDetailPrefetch(router, data.slug, source, opts);
    },
    [browseActive, router, data.slug]
  );

  const warmFeaturedMenuNavigation = useCallback(
    (productId: string, source: "pointer_enter" | "pointer_down" | "touch_start") => {
      if (!browseActive) return;
      deliveryStoreDetailPrewarmAll(data.slug, { force: true });
      prefetchStoreDetail(source, {
        force: true,
        focusProductId: productId,
      });
    },
    [browseActive, data.slug, prefetchStoreDetail]
  );

  const navigateToStore = useCallback(
    (source: StoreListCardNavSource, focusProductId?: string) => {
      const href = buildStoreDetailHref(data.slug, focusProductId);
      if (focusProductId) armStoreMenuFocusEntryIntent(focusProductId);
      saveDeliveryListScrollBeforeStoreNavigation();
      const browsePrimary =
        data.browsePrimarySlug?.trim() ||
        (typeof window !== "undefined"
          ? parseBrowsePrimarySlugFromPathname(window.location.pathname)
          : null);
      if (browsePrimary) {
        const browseSub =
          typeof window !== "undefined"
            ? parseBrowseSubSlugFromSearch(window.location.search)
            : "all";
        writeStoreDetailBrowseOrigin(data.slug, browsePrimary, browseSub);
      }
      writeStoreDetailListSeed({
        slug: data.slug,
        store_name: data.nameKo,
        hero_image_url: data.heroBannerImageUrl,
        rating_avg: data.rating,
        review_count: data.reviewCount,
        delivery_available: data.deliveryAvailable,
        pickup_available: data.pickupAvailable,
        tagline: data.tagline,
        region_badge: data.regionBadge,
      });
      deliveryStoreDetailPrewarmAll(data.slug, { force: true });
      deliveryShellEntryBeginNavigation(data.slug);
      deliveryShellEntryScheduleRouterPushStart(data.slug, href);
      router.push(href, { scroll: false });
      const prefetch = deliveryStoreDetailPrefetchForTap(router, data.slug, href);
      markStoreDetailListSeedNavigation(data.slug);
      dibayPerfRecordStoreCardNavigationIntent(data.slug);
      deliveryMenuVisibleBeginNavSession(data.slug);
      deliveryShellEntryMark("card_tap", {
        slug: data.slug,
        href,
        prefetch_hit: prefetch.hit,
        prefetch_age_ms: prefetch.age_ms,
        was_prefetched_request: prefetch.was_prefetched_request,
        was_prefetch_ready: prefetch.was_prefetch_ready,
        was_prefetch_inflight: prefetch.was_prefetch_inflight,
        prefetch_request_age_ms: prefetch.prefetch_request_age_ms,
        prefetch_ready_age_ms: prefetch.prefetch_ready_age_ms,
        prefetch_duration_ms: prefetch.prefetch_duration_ms,
        seed_saved: true,
        ...(focusProductId
          ? { focus_product_id: focusProductId, tap_surface: source }
          : { tap_surface: source }),
      });
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_ROUTE_TRANSITION, {
        event: source === "featured_menu" ? "store_featured_menu_tap" : "store_card_tap",
        slug: data.slug,
        ...(focusProductId ? { product_id: focusProductId } : {}),
      });
    },
    [data, router]
  );

  const onRowPointerWarm = useCallback(() => {
    deliveryStoreDetailPrewarmAll(data.slug);
    prefetchStoreDetail("pointer_enter");
  }, [data.slug, prefetchStoreDetail]);

  return {
    router,
    prefetchStoreDetail,
    warmFeaturedMenuNavigation,
    navigateToStore,
    onRowPointerWarm,
  };
}
