"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildDeliveryListScrollRouteKey } from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { useStoreCommerceCartOptional } from "@/contexts/StoreCommerceCartContext";
import { commerceCartHrefFromBuckets } from "@/lib/stores/store-commerce-cart-nav";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
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
} from "@/components/stores/store-category-pill-styles";
import {
  StoreDeliveryRowCard,
  browseItemToRowCard,
  storeRowCardDataEqual,
  type StoreRowCardData,
} from "@/components/stores/home/StoreDeliveryRowCard";
import { fetchStoresBrowseDeduped, fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { storeSecondaryBrowseIconPath } from "@/lib/stores/store-secondary-browse-icons";
import { resolveBrowseListUserOriginCoords } from "@/lib/stores/browse-list-user-origin-coords";
import { ME_PROFILE_CACHE_INVALIDATED_EVENT } from "@/lib/profile/fetch-me-profile-deduped";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

const RESTAURANT_SUB_ICON: Record<string, string> = {
  korean: "/icons/food/icon_0_1.png",
  chinese: "/icons/food/icon_1_0.png",
  japanese: "/icons/food/icon_1_1.png",
  western: "/icons/food/icon_1_2.png",
  pizza: "/icons/food/icon_1_2.png",
  snack: "/icons/food/icon_1_3.png",
  chicken: "/icons/food/icon_0_2.png",
  lunchbox: "/icons/food/icon_2_0.png",
  local: "/icons/food/icon_2_1.png",
  dessert: "/icons/food/icon_2_2.png",
  late_night: "/icons/food/icon_2_3.png",
};

function browseStableTieBreak(a: BrowseStoreListItem, b: BrowseStoreListItem): number {
  const bySlug = a.slug.localeCompare(b.slug);
  if (bySlug !== 0) return bySlug;
  return a.id.localeCompare(b.id);
}

function sortBrowseStores(
  rows: BrowseStoreListItem[],
  sort: StoreBrowseSortId,
  hasGeo: boolean
): BrowseStoreListItem[] {
  const r = [...rows];
  switch (sort) {
    case "rating":
      return r.sort(
        (a, b) =>
          b.rating - a.rating ||
          b.reviewCount - a.reviewCount ||
          browseStableTieBreak(a, b)
      );
    case "reviews":
      return r.sort((a, b) => b.reviewCount - a.reviewCount || browseStableTieBreak(a, b));
    case "distance":
      if (!hasGeo) return r;
      return r.sort((a, b) => {
        const da = a.distanceKm;
        const db = b.distanceKm;
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return browseStableTieBreak(a, b);
      });
    case "fast":
      return r.sort((a, b) => {
        const pa = a.deliveryAvailable ? 0 : 1;
        const pb = b.deliveryAvailable ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const prep = (a.etaLabel ?? a.estPrepLabel).localeCompare(b.etaLabel ?? b.estPrepLabel, "ko");
        return prep !== 0 ? prep : browseStableTieBreak(a, b);
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
  const { t } = useI18n();
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
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
        aria-label={t("common_search")}
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
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
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
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listScrollSearch = searchParams.toString();
  const listScrollRouteKey = useMemo(
    () =>
      buildDeliveryListScrollRouteKey(
        pathname ?? `/stores/browse/${primarySlug}`,
        listScrollSearch ? `?${listScrollSearch}` : ""
      ),
    [pathname, primarySlug, listScrollSearch]
  );
  const industryVersion = useBrowseIndustryDatasetVersion();
  const regionCtx = useRegionOptional();
  const primaryRegion = regionCtx?.primaryRegion ?? null;
  const [taxonomy, setTaxonomy] = useState<{ categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null>(
    null
  );
  /** undefined = 아직 첫 응답 전 */
  const [remoteRows, setRemoteRows] = useState<BrowseStoreListItem[] | undefined>(undefined);
  const [feedSource, setFeedSource] = useState<BrowseFeedMetaSource>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [listSort, setListSort] = useState<StoreBrowseSortId>("default");
  /** browse `user_lat`/`user_lng` — 주소 기본→프로필→GPS 순으로 matrix ETA·직선 거리 */
  const [browseUserGeo, setBrowseUserGeo] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let seq = 0;
    const run = () => {
      const my = ++seq;
      void (async () => {
        const c = await resolveBrowseListUserOriginCoords();
        if (cancelled || my !== seq) return;
        setBrowseUserGeo(c);
      })();
    };
    run();
    const onRefresh = () => run();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
    window.addEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
      window.removeEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onRefresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        const j = jRaw as { ok?: boolean; categories?: unknown; topics?: unknown };
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({
            categories: j.categories as StoreTaxonomyCategory[],
            topics: j.topics as StoreTaxonomyTopic[],
          });
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) setTaxonomy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primary = useMemo(() => {
    if (!taxonomy || taxonomy.categories.length === 0) return getBrowsePrimaryBySlug(primarySlug);
    const pk = primarySlug.trim().toLowerCase();
    const c = taxonomy.categories.find((x) => String(x.slug ?? "").trim().toLowerCase() === pk);
    if (!c) return null;
    const fb = getBrowsePrimaryBySlug(primarySlug);
    return {
      id: c.id,
      slug: c.slug,
      nameKo: c.name,
      sortOrder: c.sort_order,
      symbol: fb?.symbol ?? "🏷️",
    };
  }, [primarySlug, taxonomy, industryVersion]);

  const subs = useMemo(() => {
    if (!taxonomy || taxonomy.categories.length === 0) return listBrowseSubIndustries(primarySlug);
    const pk = primarySlug.trim().toLowerCase();
    const c = taxonomy.categories.find((x) => String(x.slug ?? "").trim().toLowerCase() === pk);
    if (!c) return [];
    const sorted = taxonomy.topics
      .filter((t) => t.store_category_id === c.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const seenSlug = new Set<string>();
    const out: {
      id: string;
      slug: string;
      nameKo: string;
      primarySlug: string;
      sortOrder: number;
      imageUrl?: string | null;
    }[] = [];
    for (const t of sorted) {
      const sk = String(t.slug ?? "").trim().toLowerCase();
      if (!sk || seenSlug.has(sk)) continue;
      seenSlug.add(sk);
      out.push({
        id: t.id,
        slug: t.slug,
        nameKo: t.name,
        primarySlug,
        sortOrder: t.sort_order,
        imageUrl: typeof (t as any).image_url === "string" ? String((t as any).image_url).trim() || null : null,
      });
    }
    return out;
  }, [primarySlug, taxonomy, industryVersion]);

  const [optimisticSub, setOptimisticSub] = useState<string | null>(null);
  const lastTapPerfRef = useRef<{ sub: string; t0: number } | null>(null);
  const lastNavPerfRef = useRef<{ sub: string; t0: number; kind: "tap" | "pop" } | null>(null);

  const trimmedBrowseSubParam = useMemo(
    () => {
      const sp = searchParams?.get("sub");
      if (typeof sp === "string" && sp.trim()) return sp.trim().toLowerCase();
      return typeof initialSubSlug === "string" ? initialSubSlug.trim().toLowerCase() : "";
    },
    [searchParams, initialSubSlug]
  );

  /** taxonomy 에 없는·비정상 sub 쿼리는 목록은 전체로 맞추고 칩도 「전체」와 일치시킴 */
  const matchedTopicSlug = useMemo(() => {
    const p = trimmedBrowseSubParam;
    if (!p || p === "all") return null;
    const hit = subs.find((s) => s.slug.toLowerCase() === p);
    return hit ? hit.slug : null;
  }, [trimmedBrowseSubParam, subs]);

  useEffect(() => {
    // URL/searchParams가 확정되면 optimistic 상태를 해제
    setOptimisticSub(null);
  }, [matchedTopicSlug, primarySlug]);

  const activeSub = optimisticSub ?? (matchedTopicSlug ?? "all");

  const allSubChipActive = activeSub === "all";

  useEffect(() => {
    // 탭 클릭 직후 "선택 표시"까지의 지연(대략 1~2 frame) 계측
    const tap = lastTapPerfRef.current;
    if (!tap) return;
    if (activeSub !== tap.sub) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const dt = Math.max(0, performance.now() - tap.t0);
        // eslint-disable-next-line no-console
        console.log("[dibay-store-browse-perf]", {
          metric: "tap_to_active_underline_ms",
          value_ms: Math.round(dt),
          route: `/stores/browse/${primarySlug}`,
          sub: tap.sub,
          timestamp: Date.now(),
        });
      });
    });
    // 한 번만
    lastTapPerfRef.current = null;
  }, [activeSub, primarySlug]);

  useEffect(() => {
    // activeSub가 확정되면 "목록 표시"까지 계측 시작(탭/뒤로가기 둘 다)
    const nav = lastNavPerfRef.current;
    if (!nav) return;
    if (nav.sub !== activeSub) return;
    if (remoteRows === undefined) return;
    requestAnimationFrame(() => {
      const dt = Math.max(0, performance.now() - nav.t0);
      // eslint-disable-next-line no-console
      console.log("[dibay-store-browse-perf]", {
        metric: nav.kind === "tap" ? "tap_to_list_visible_ms" : "pop_to_list_visible_ms",
        value_ms: Math.round(dt),
        route: `/stores/browse/${primarySlug}`,
        sub: nav.sub,
        list_len: Array.isArray(remoteRows) ? remoteRows.length : null,
        timestamp: Date.now(),
      });
    });
    lastNavPerfRef.current = null;
  }, [activeSub, primarySlug, remoteRows]);

  useEffect(() => {
    // 뒤로가기(popstate) 복귀 계측
    const onPop = () => {
      const sp = searchParams?.get("sub");
      const sub = typeof sp === "string" && sp.trim() ? sp.trim().toLowerCase() : "all";
      lastNavPerfRef.current = { sub, t0: performance.now(), kind: "pop" };
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [searchParams]);

  const browseQuerySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const cityLabel =
      primaryRegion?.regionId && primaryRegion?.cityId
        ? browseCityLabel(primaryRegion.regionId, primaryRegion.cityId)
        : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    q.set("primary", primarySlug.trim().toLowerCase());
    q.set("sub", activeSub);
    if (r) q.set("region", r);
    if (cityLabel) q.set("city", cityLabel);
    if (d) q.set("district", d);
    if (
      browseUserGeo &&
      Number.isFinite(browseUserGeo.lat) &&
      Number.isFinite(browseUserGeo.lng)
    ) {
      q.set("user_lat", String(browseUserGeo.lat));
      q.set("user_lng", String(browseUserGeo.lng));
    }
    return q.toString();
  }, [
    primarySlug,
    activeSub,
    primaryRegion?.regionId,
    primaryRegion?.cityId,
    primaryRegion?.barangay,
    browseUserGeo?.lat,
    browseUserGeo?.lng,
  ]);

  const browseListContextKey = useMemo(
    () =>
      [
        primarySlug,
        activeSub,
        primaryRegion?.regionId ?? "",
        primaryRegion?.cityId ?? "",
        primaryRegion?.barangay ?? "",
        browseUserGeo ? `${browseUserGeo.lat.toFixed(4)},${browseUserGeo.lng.toFixed(4)}` : "",
      ].join("|"),
    [primarySlug, activeSub, primaryRegion?.regionId, primaryRegion?.cityId, primaryRegion?.barangay, browseUserGeo]
  );
  const prevBrowseListContextKeyRef = useRef<string | null>(null);
  const browseHadListForContextRef = useRef(false);
  const remoteCacheRef = useRef<
    Map<string, { rows: BrowseStoreListItem[]; source: BrowseFeedMetaSource }>
  >(new Map());

  const loadRemote = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setRemoteLoading((prev) => (prev ? prev : true));
        setFeedSource((prev) => (prev === null ? prev : null));
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
          const rows = j.stores as BrowseStoreListItem[];
          const source = src as BrowseFeedMetaSource;
          remoteCacheRef.current.set(browseListContextKey, { rows, source });
          setRemoteRows(rows);
          setFeedSource(source);
          browseHadListForContextRef.current = true;
        } else {
          setRemoteRows([]);
          setFeedSource(null);
          if (!silent) browseHadListForContextRef.current = false;
        }
      } catch {
        if (!silent) {
          setRemoteRows([]);
          setFeedSource((prev) => (prev === null ? prev : null));
          browseHadListForContextRef.current = false;
        }
      } finally {
        if (!silent) setRemoteLoading((prev) => (prev ? false : prev));
      }
    },
    [browseQuerySuffix, browseListContextKey]
  );

  useEffect(() => {
    const ctxChanged = prevBrowseListContextKeyRef.current !== browseListContextKey;
    if (ctxChanged) {
      prevBrowseListContextKeyRef.current = browseListContextKey;
      browseHadListForContextRef.current = false;
    }
    const cached = remoteCacheRef.current.get(browseListContextKey);
    if (cached) {
      setRemoteRows(cached.rows);
      setFeedSource(cached.source);
      setRemoteLoading(false);
      browseHadListForContextRef.current = true;
    }
    const silent = !!cached || browseHadListForContextRef.current;
    void loadRemote({ silent });
  }, [loadRemote, browseListContextKey]);

  useEffect(() => {
    setListSort("default");
  }, [activeSub, primarySlug]);

  useRefetchOnPageShowRestore(() => void loadRemote({ silent: true }));

  /** browse 목록: `user_lat`/`user_lng`(주소록 우선)로 직선거리 정렬만 수행 — matrix ETA 금지 */
  const hasGeo = browseUserGeo != null;
  const listLoaded = remoteRows !== undefined;
  useDeliveryListScrollRestore(listScrollRouteKey, listLoaded);
  const useRemoteList = listLoaded && remoteRows.length > 0;
  const sortedRemoteRows = useMemo(() => {
    if (!remoteRows?.length) return remoteRows;
    return sortBrowseStores(remoteRows, listSort, hasGeo);
  }, [remoteRows, listSort, hasGeo]);

  const browseRowCardCacheRef = useRef<Map<string, StoreRowCardData>>(new Map());
  const browseRowCardListRef = useRef<StoreRowCardData[] | null>(null);

  const storeDeliveryRowDataList = useMemo(() => {
    const rows = sortedRemoteRows ?? [];
    if (!rows.length) {
      browseRowCardCacheRef.current.clear();
      browseRowCardListRef.current = [];
      return [];
    }
    const cache = browseRowCardCacheRef.current;
    const nextIds = new Set<string>();
    const reconciled: StoreRowCardData[] = [];
    for (const s of rows) {
      nextIds.add(s.id);
      const next = browseItemToRowCard(s);
      const prev = cache.get(s.id);
      if (prev && storeRowCardDataEqual(prev, next)) {
        reconciled.push(prev);
      } else {
        cache.set(s.id, next);
        reconciled.push(next);
      }
    }
    for (const id of [...cache.keys()]) {
      if (!nextIds.has(id)) cache.delete(id);
    }
    const prior = browseRowCardListRef.current;
    if (prior && prior.length === reconciled.length && prior.every((row, i) => row === reconciled[i])) {
      return prior;
    }
    browseRowCardListRef.current = reconciled;
    return reconciled;
  }, [sortedRemoteRows]);

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

  const otherPrimaries = useMemo(
    () => listBrowsePrimaryIndustries().filter((p) => p.slug.toLowerCase() !== primarySlug.toLowerCase()),
    [primarySlug, industryVersion]
  );

  const browseStickyBelow: ReactNode = useMemo(
    () => (
      <div className="border-b border-sam-border bg-[var(--sub-bg)]">
        <div className="bg-sam-surface dark:bg-[#242526]">
          <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pb-1.5 pt-1`}>
            <HorizontalDragScroll
              className={`${STORE_CATEGORY_PILL_SCROLL} gap-0.5`}
              style={{ WebkitOverflowScrolling: "touch" }}
              aria-label={t("store_sub_industry_aria")}
            >
              {(() => {
              const isRestaurant = primarySlug.trim().toLowerCase() === "restaurant";
              const allIconSrc = isRestaurant ? "/icons/food/icon_0_0.png" : storeSecondaryBrowseIconPath(primarySlug, 0);

              const baseItemClass =
                "flex w-[54px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-sam-md border border-transparent px-0.5 py-1.5 text-center transition-[transform,color] duration-150 will-change-transform active:scale-[0.97]";
              const activeClass = "text-sam-fg dark:text-[#E4E6EB]";
              const idleClass =
                "text-sam-muted active:bg-sam-surface-muted dark:text-[#B0B3B8] dark:active:bg-[#4E4F50]";

              const Item = ({
                href,
                on,
                label,
                iconSrc,
                subValue,
              }: {
                href: string;
                on: boolean;
                label: string;
                iconSrc: string | null;
                subValue: string;
              }) => (
                <button
                  type="button"
                  data-sub={subValue}
                  aria-current={on ? "page" : undefined}
                  onClick={() => {
                    if (on) return;
                    const t0 = performance.now();
                    lastTapPerfRef.current = { sub: subValue, t0 };
                    lastNavPerfRef.current = { sub: subValue, t0, kind: "tap" };
                    setOptimisticSub(subValue);
                    startTransition(() => {
                      // 뒤로가기 복귀 경로를 유지하기 위해 replace 대신 push
                      router.push(href, { scroll: false });
                    });
                  }}
                  className={`${baseItemClass} ${on ? activeClass : idleClass}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center" aria-hidden>
                    {iconSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={iconSrc}
                        alt=""
                        aria-hidden
                        className={`h-10 w-10 object-contain ${on ? "opacity-100" : "opacity-90"}`}
                        loading="lazy"
                      />
                    ) : (
                      <span className="h-10 w-10 rounded-full bg-sam-surface-muted" aria-hidden />
                    )}
                  </span>
                  <span className={`text-[12.5px] font-semibold leading-none tracking-[-0.01em] ${on ? "" : ""}`}>
                    {label}
                  </span>
                  <span
                    className="mt-1 h-1 w-10 rounded-full"
                    style={{ backgroundColor: on ? "#1C8DB8" : "transparent" }}
                    aria-hidden
                  />
                </button>
              );

              return (
                <>
                  <Item
                    href={storesBrowsePrimaryPath(primarySlug)}
                    on={allSubChipActive}
                    label="전체"
                    iconSrc={allIconSrc}
                    subValue="all"
                  />
                  {subs.map((s, idx) => {
                    const on = activeSub !== "all" && activeSub === s.slug;
                    const label = String((s as any).nameKo ?? (s as any).name ?? "").trim();
                    const uploaded = typeof (s as any).imageUrl === "string" ? String((s as any).imageUrl).trim() : "";
                    const iconSrc =
                      isRestaurant ?
                        (RESTAURANT_SUB_ICON[String(s.slug ?? "").trim().toLowerCase()] ?? null)
                      : (uploaded || storeSecondaryBrowseIconPath(primarySlug, idx + 1));
                    return (
                      <Item
                        key={s.id}
                        href={storesBrowsePath(primarySlug, s.slug)}
                        on={on}
                        label={label}
                        iconSrc={iconSrc}
                        subValue={s.slug}
                      />
                    );
                  })}
                </>
              );
            })()}
            </HorizontalDragScroll>
          </div>
          <div className="h-px bg-sam-border dark:bg-[#3E4042]" aria-hidden />
        </div>
        <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pb-2 pt-2`}>
          <StoreListFilters sort={listSort} onSortChange={setListSort} hasGeo={hasGeo} />
        </div>
      </div>
    ),
    [browseSubtitle, subs, primarySlug, listSort, hasGeo, allSubChipActive, matchedTopicSlug]
  );

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    if (!primary || subs.length === 0) {
      setMainTier1Extras({
        tier1: {
          titleText: "업종",
          backHref: "/stores",
          preferHistoryBack: false,
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
        preferHistoryBack: false,
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
        <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pt-4`}>
          <p className="text-sm text-sam-muted">{t("store_invalid_industry")}</p>
          <Link href="/stores" className="mt-4 inline-block text-sm text-signature">
            매장 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] bg-sam-app pb-8 dark:bg-[#18191A]">
      <section className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} space-y-4 pt-2`}>
        {remoteLoading && !listLoaded ?
          <p className="py-4 text-center text-sm text-sam-muted">{t("store_verifying_live_link")}</p>
        : null}
        {useRemoteList ?
          <ul className="space-y-2">
            {storeDeliveryRowDataList.map((data) => (
              <StoreDeliveryRowCard key={data.slug} data={data} />
            ))}
          </ul>
        : showEmptyBlock ?
          <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-10 text-center dark:border-sam-border dark:bg-[#242526]">
            <p className="text-sm text-sam-muted dark:text-sam-meta">{t("store_empty_store_list")}</p>
            <p className="mt-1 text-xs text-sam-meta dark:text-sam-muted">
              {feedSource === "supabase_unconfigured" ?
                "매장 목록을 준비 중입니다. 잠시 후 다시 확인하거나 다른 업종을 먼저 둘러보세요."
              : "다른 세부 업종을 선택하거나, 매장의 업종·세부 주제·승인·노출 상태를 확인해 주세요."}
            </p>
            {otherPrimaries.length > 0 ?
              <div className="mt-5">
                <p className="mb-2 sam-text-xxs font-semibold text-sam-muted dark:text-sam-meta">{t("store_browse_other_industries")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {otherPrimaries.map((p) => (
                    <Link
                      key={p.id}
                      href={storesBrowsePrimaryPath(p.slug)}
                      className="inline-flex items-center gap-1 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-semibold text-sam-fg active:bg-sam-surface-muted dark:border-sam-border dark:bg-[#3A3B3C] dark:text-[#E4E6EB]"
                    >
                      <span aria-hidden>{p.symbol}</span>
                      {p.nameKo}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/stores#store-industry-explore"
                  className="mt-4 inline-block sam-text-body-secondary font-semibold text-signature"
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
