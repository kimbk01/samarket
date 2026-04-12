"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import { APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useRegionOptional } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
import { REGIONS } from "@/lib/products/form-options";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import {
  getBrowsePrimaryBySlug,
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { StoreListFilters, type StoreBrowseSortId } from "./StoreListFilters";
import { storesBrowsePath, storesBrowsePrimaryPath } from "./stores-browse-paths";
import {
  STORE_CATEGORY_PILL_SCROLL,
  storeCategoryPillClass,
} from "@/components/stores/store-category-pill-styles";
import { StoreDeliveryRowCard, browseItemToRowCard } from "@/components/stores/home/StoreDeliveryRowCard";
import { StorePrimaryIndustrySwitcher } from "@/components/stores/home/StorePrimaryIndustrySwitcher";
import { fetchStoresBrowseDeduped } from "@/lib/stores/store-delivery-api-client";

function sortBrowseStores(
  rows: BrowseStoreListItem[],
  sort: StoreBrowseSortId,
  hasGeo: boolean
): BrowseStoreListItem[] {
  const r = [...rows];
  switch (sort) {
    case "rating":
      return r.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case "reviews":
      return r.sort((a, b) => b.reviewCount - a.reviewCount);
    case "distance":
      if (!hasGeo) return r;
      return r.sort((a, b) => {
        const da = a.distanceKm;
        const db = b.distanceKm;
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return 0;
      });
    case "fast":
      return r.sort((a, b) => {
        const pa = a.deliveryAvailable ? 0 : 1;
        const pb = b.deliveryAvailable ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.estPrepLabel.localeCompare(b.estPrepLabel, "ko");
      });
    default:
      return r;
  }
}

function browseCityLabel(regionId: string, cityId: string): string {
  const reg = REGIONS.find((x) => x.id === regionId);
  const city = reg?.cities.find((c) => c.id === cityId);
  return (city?.name ?? "").trim();
}

function StoresBrowseCartAction() {
  const commerceCart = useStoreCommerceCartOptional();
  const cartLineKindCount = commerceCart?.hydrated ? commerceCart.totalItemCountAllStores : 0;
  const cartHref = useMemo(() => {
    if (!commerceCart?.hydrated) return "/stores";
    return commerceCartHrefFromBuckets(commerceCart.listCartBuckets());
  }, [commerceCart]);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Link
        href="/search"
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="검색"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </Link>
      <Link
        href={cartHref}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label={cartLineKindCount > 0 ? "장바구니" : "매장"}
      >
        <StoreCommerceCartStrokeIcon className="h-5 w-5" />
        {cartLineKindCount > 0 ? (
          <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
            {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

type BrowseFeedMetaSource = "supabase" | "supabase_unconfigured" | null;

export function StoresBrowsePrimaryView({
  primarySlug,
  initialSubSlug,
}: {
  primarySlug: string;
  initialSubSlug: string | null;
}) {
  const industryVersion = useBrowseIndustryDatasetVersion();
  const regionCtx = useRegionOptional();
  const primaryRegion = regionCtx?.primaryRegion ?? null;
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  /** undefined = 아직 첫 응답 전 */
  const [remoteRows, setRemoteRows] = useState<BrowseStoreListItem[] | undefined>(undefined);
  const [feedSource, setFeedSource] = useState<BrowseFeedMetaSource>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [listSort, setListSort] = useState<StoreBrowseSortId>("default");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { maximumAge: 300_000, timeout: 10_000 }
    );
  }, []);

  const primary = useMemo(
    () => getBrowsePrimaryBySlug(primarySlug),
    [primarySlug, industryVersion]
  );
  const subs = useMemo(
    () => listBrowseSubIndustries(primarySlug),
    [primarySlug, industryVersion]
  );

  const activeSub = useMemo(() => {
    if (initialSubSlug && subs.some((s) => s.slug === initialSubSlug)) return initialSubSlug;
    return subs[0]?.slug ?? "";
  }, [initialSubSlug, subs]);

  const browseQuerySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const cityLabel =
      primaryRegion?.regionId && primaryRegion?.cityId
        ? browseCityLabel(primaryRegion.regionId, primaryRegion.cityId)
        : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    q.set("primary", primarySlug);
    q.set("sub", activeSub);
    if (r) q.set("region", r);
    if (cityLabel) q.set("city", cityLabel);
    if (d) q.set("district", d);
    if (userGeo) {
      q.set("user_lat", String(userGeo.lat));
      q.set("user_lng", String(userGeo.lng));
    }
    return q.toString();
  }, [
    primarySlug,
    activeSub,
    primaryRegion?.regionId,
    primaryRegion?.cityId,
    primaryRegion?.barangay,
    userGeo,
  ]);

  const loadRemote = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!activeSub) {
        if (!silent) {
          setRemoteRows([]);
          setFeedSource(null);
          setRemoteLoading(false);
        }
        return;
      }
      if (!silent) {
        setRemoteLoading(true);
        setRemoteRows(undefined);
        setFeedSource(null);
      }
      try {
        const { json } = await fetchStoresBrowseDeduped(browseQuerySuffix);
        const j = json as {
          ok?: boolean;
          stores?: unknown;
          meta?: { source?: string };
        };
        const src = j?.meta?.source;
        const okSources = src === "supabase" || src === "supabase_unconfigured";
        if (j?.ok && Array.isArray(j.stores) && okSources) {
          setRemoteRows(j.stores as BrowseStoreListItem[]);
          setFeedSource(src as BrowseFeedMetaSource);
        } else {
          setRemoteRows([]);
          setFeedSource(null);
        }
      } catch {
        if (!silent) {
          setRemoteRows([]);
          setFeedSource(null);
        }
      } finally {
        if (!silent) setRemoteLoading(false);
      }
    },
    [activeSub, browseQuerySuffix]
  );

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    setListSort("default");
  }, [activeSub, primarySlug]);

  useRefetchOnPageShowRestore(() => void loadRemote({ silent: true }));

  const hasGeo = userGeo !== null;
  const listLoaded = remoteRows !== undefined;
  const useRemoteList = listLoaded && remoteRows.length > 0;
  const sortedRemoteRows = useMemo(() => {
    if (!remoteRows?.length) return remoteRows;
    return sortBrowseStores(remoteRows, listSort, hasGeo);
  }, [remoteRows, listSort, hasGeo]);

  const showEmptyBlock = listLoaded && remoteRows.length === 0;

  const browseSubtitle = useMemo(() => {
    if (!primary || subs.length === 0) return "";
    if (!listLoaded && remoteLoading) return "실매장 목록을 불러오는 중…";
    if (feedSource === "supabase_unconfigured") {
      return "지금은 이 업종의 매장 목록을 준비 중입니다. 잠시 후 다시 확인해 주세요.";
    }
    if (useRemoteList) {
      return "등록된 실매장입니다. 동네·위치 설정에 따라 정렬됩니다.";
    }
    if (feedSource === "supabase") {
      return "이 업종·세부 주제에 노출된 매장이 없습니다. 업종·승인·노출을 확인해 주세요.";
    }
    return "목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }, [primary, subs.length, listLoaded, remoteLoading, feedSource, useRemoteList]);

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  const allSubChipActive = initialSubSlug == null || initialSubSlug === "";

  const otherPrimaries = useMemo(
    () => listBrowsePrimaryIndustries().filter((p) => p.slug.toLowerCase() !== primarySlug.toLowerCase()),
    [primarySlug, industryVersion]
  );

  const browseStickyBelow: ReactNode = useMemo(
    () => (
      <div className="border-b border-ig-border bg-[var(--sub-bg)]">
        <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-2 pt-1`}>
          <StorePrimaryIndustrySwitcher embeddedPrimarySlug={primarySlug} showHomeChip={false} />
        </div>
        <p
          className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-1.5 text-[11px] leading-snug text-[var(--text-muted)]`}
        >
          다른 업종은 위 칩에서 바로 바꿀 수 있어요. 아래 정렬로 배달·거리·평점을 맞춰 보세요.
        </p>
        <p
          className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-1.5 pt-0 text-[11px] leading-snug text-[var(--text-muted)]`}
        >
          {browseSubtitle}
        </p>
        <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-2`}>
          <HorizontalDragScroll
            className={STORE_CATEGORY_PILL_SCROLL}
            style={{ WebkitOverflowScrolling: "touch" }}
            aria-label="하위 업종"
          >
            <Link
              href={storesBrowsePrimaryPath(primarySlug)}
              scroll={false}
              className={storeCategoryPillClass(allSubChipActive)}
            >
              전체
            </Link>
            {subs.map((s) => {
              const on =
                !allSubChipActive &&
                (initialSubSlug ?? "").toLowerCase() === s.slug.toLowerCase();
              return (
                <Link
                  key={s.id}
                  href={storesBrowsePath(primarySlug, s.slug)}
                  scroll={false}
                  className={storeCategoryPillClass(on)}
                >
                  {s.nameKo}
                </Link>
              );
            })}
          </HorizontalDragScroll>
        </div>
        <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-2 pt-0.5`}>
          <StoreListFilters sort={listSort} onSortChange={setListSort} hasGeo={hasGeo} />
        </div>
      </div>
    ),
    [browseSubtitle, subs, primarySlug, listSort, hasGeo, allSubChipActive, initialSubSlug]
  );

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    if (!primary || subs.length === 0) {
      setMainTier1Extras({
        tier1: {
          titleText: "업종",
          backHref: "/stores",
          preferHistoryBack: true,
          ariaLabel: "이전 화면",
          showHubQuickActions: false,
          rightSlot: <StoresBrowseCartAction />,
        },
      });
      return () => setMainTier1Extras(null);
    }

    setMainTier1Extras({
      tier1: {
        titleText: primary.nameKo,
        backHref: "/stores",
        preferHistoryBack: true,
        ariaLabel: "이전 화면",
        showHubQuickActions: false,
        rightSlot: <StoresBrowseCartAction />,
      },
      stickyBelow: browseStickyBelow,
    });
    return () => setMainTier1Extras(null);
  }, [
    setMainTier1Extras,
    primary,
    subs,
    browseStickyBelow,
    primarySlug,
    industryVersion,
  ]);

  if (!primary || subs.length === 0) {
    return (
      <div className="min-h-[40vh] pb-8">
        <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pt-4`}>
          <p className="text-sm text-sam-muted">존재하지 않는 업종입니다.</p>
          <Link href="/stores" className="mt-4 inline-block text-sm text-signature">
            매장 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] bg-[#F0F2F5] pb-8 dark:bg-[#18191A]">
      <section className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} space-y-4 pt-2`}>
        {remoteLoading && !listLoaded ?
          <p className="py-4 text-center text-sm text-sam-muted">실매장 연동 확인 중…</p>
        : null}
        {useRemoteList ?
          <ul className="space-y-2">
            {(sortedRemoteRows ?? remoteRows)!.map((s) => (
              <StoreDeliveryRowCard key={s.id} data={browseItemToRowCard(s)} />
            ))}
          </ul>
        : showEmptyBlock ?
          <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-10 text-center dark:border-sam-border dark:bg-[#242526]">
            <p className="text-sm text-sam-muted dark:text-sam-meta">표시할 매장이 없습니다.</p>
            <p className="mt-1 text-xs text-sam-meta dark:text-sam-muted">
              {feedSource === "supabase_unconfigured" ?
                "매장 목록을 준비 중입니다. 잠시 후 다시 확인하거나 다른 업종을 먼저 둘러보세요."
              : "다른 세부 업종을 선택하거나, 매장의 업종·세부 주제·승인·노출 상태를 확인해 주세요."}
            </p>
            {otherPrimaries.length > 0 ?
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold text-sam-muted dark:text-sam-meta">다른 업종 둘러보기</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {otherPrimaries.map((p) => (
                    <Link
                      key={p.id}
                      href={storesBrowsePrimaryPath(p.slug)}
                      className="inline-flex items-center gap-1 rounded-full border border-sam-border bg-[#F7F7F7] px-3 py-1.5 text-[12px] font-semibold text-sam-fg active:bg-sam-surface-muted dark:border-sam-border dark:bg-[#3A3B3C] dark:text-[#E4E6EB]"
                    >
                      <span aria-hidden>{p.symbol}</span>
                      {p.nameKo}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/stores#store-industry-explore"
                  className="mt-4 inline-block text-[13px] font-semibold text-signature"
                >
                  매장 홈 업종 지도로
                </Link>
              </div>
            : null}
          </div>
        : null}
      </section>
    </div>
  );
}
