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
  useSyncExternalStore,
  startTransition,
  type ReactNode,
} from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { useRegionOptional } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
import { REGIONS } from "@/lib/products/form-options";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { getBrowsePrimaryBySlug, listBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";
import { BrowseSubtopicCollapseSentinel } from "@/components/stores/browse/BrowseSubtopicCollapseSentinel";
import { StoresBrowsePullRefreshHint } from "@/components/stores/browse/StoresBrowsePullRefreshHint";
import { StoresBrowsePullRefreshRegister } from "@/components/stores/browse/StoresBrowsePullRefreshRegister";
import { StoreListFilters, type StoreBrowseSortId } from "./StoreListFilters";
import { STORES_BROWSE_SUB_ALL, storesBrowseNavSubSlug, storesBrowsePrimaryPath } from "./stores-browse-paths";
import {
  StoreDeliveryRowCard,
  browseItemToRowCard,
  storeRowCardDataEqual,
  type StoreRowCardData,
} from "@/components/stores/home/StoreDeliveryRowCard";
import { StoreDeliveryListLoading } from "@/components/stores/StoreDeliveryListLoading";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";
import {
  fetchStoresBrowseDeduped,
  forgetStoresBrowseFetchSingleFlight,
  invalidateStoresBrowseClientCache,
  peekStoresBrowseClientCache,
} from "@/lib/stores/store-delivery-api-client";
import {
  invalidateStoresBrowseSessionCache,
  peekStoresBrowseListPaintCache,
  readInitialBrowseListSessionSnapshot,
  writeStoresBrowseSessionCache,
} from "@/lib/stores/stores-browse-client-session-cache";
import { reloadBrowseTaxonomySnapshot } from "@/lib/stores/browse-taxonomy-snapshot";
import {
  resolveBrowseListQuerySub,
  resolveBrowseMatchedSubSlug,
} from "@/lib/stores/browse-header-sub-selection";
import { useBrowseSubIndustries } from "@/lib/stores/use-browse-sub-industries";
import { useBrowseSubAllCanonicalUrl } from "@/lib/stores/use-browse-sub-all-canonical-url";
import { useBrowseTaxonomySnapshot } from "@/lib/stores/use-browse-taxonomy-snapshot";
import {
  browseListUserOriginCoordsEqual,
  resolveBrowseListUserOriginCoords,
} from "@/lib/stores/browse-list-user-origin-coords";
import { APP_BOOT_PROFILE_UPDATED_EVENT } from "@/lib/app-boot/app-boot-types";
import { ME_PROFILE_CACHE_INVALIDATED_EVENT } from "@/lib/profile/fetch-me-profile-deduped";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { resolveStorePrimaryIndustryLabel } from "@/lib/i18n/store-browse-label-i18n";
import { parseStoreBrowseSortParam } from "@/lib/stores/stores-home-section-browse-hrefs";
import {
  getBrowseSubChipOptimisticSubServerSnapshot,
  getBrowseSubChipOptimisticSubSnapshot,
  setBrowseSubChipOptimisticSub,
  subscribeBrowseSubChipOptimisticSub,
  getBrowseListRefreshServerSnapshot,
  getBrowseListRefreshSnapshot,
  subscribeBrowseListRefresh,
} from "@/lib/stores/browse-sub-chip-navigation";

function browseStableTieBreak(a: BrowseStoreListItem, b: BrowseStoreListItem): number {
  const bySlug = a.slug.localeCompare(b.slug);
  if (bySlug !== 0) return bySlug;
  return a.id.localeCompare(b.id);
}

function sortBrowseStores(
  rows: BrowseStoreListItem[],
  sort: StoreBrowseSortId,
  hasGeo: boolean,
  locale: string
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
        const prep = (a.etaLabel ?? a.estPrepLabel).localeCompare(
          b.etaLabel ?? b.estPrepLabel,
          locale
        );
        return prep !== 0 ? prep : browseStableTieBreak(a, b);
      });
    default:
      return r;
  }
}

/** `browseListContextKey` — geo(5번째) 제외 비교용 */
function browseListContextKeyWithoutGeo(key: string): string {
  const parts = key.split("|");
  if (parts.length >= 5) parts[4] = "";
  return parts.join("|");
}

function browseCityLabel(regionId: string, cityId: string): string {
  const reg = REGIONS.find((x) => x.id === regionId);
  const city = reg?.cities.find((c) => c.id === cityId);
  return (city?.name ?? "").trim();
}

type BrowseFeedMetaSource = "supabase" | "supabase_unconfigured" | null;

export function StoresBrowsePrimaryView({
  primarySlug,
  initialSubSlug,
}: {
  primarySlug: string;
  initialSubSlug: string | null;
}) {
  const { t, safeT, language } = useI18n();
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
  const subtopicCollapseRouteKey = useMemo(() => {
    const sub = searchParams?.get("sub")?.trim().toLowerCase() || "all";
    return `${primarySlug}|${sub}`;
  }, [primarySlug, searchParams]);
  /** 거리 정책 운영 적용 전까지 기본 browse 목록 요청에는 좌표를 싣지 않는다. */
  const browseDistanceCoordsEnabled = false;
  const regionCtx = useRegionOptional();
  const primaryRegion = regionCtx?.primaryRegion ?? null;
  const taxonomy = useBrowseTaxonomySnapshot();
  /** undefined = 아직 첫 응답 전 — remount·HMR 직후 sessionStorage 로 즉시 paint */
  const [remoteRows, setRemoteRows] = useState<BrowseStoreListItem[] | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return readInitialBrowseListSessionSnapshot()?.rows;
  });
  const [feedSource, setFeedSource] = useState<BrowseFeedMetaSource>(() => {
    if (typeof window === "undefined") return null;
    return readInitialBrowseListSessionSnapshot()?.source ?? null;
  });
  const [remoteLoading, setRemoteLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !readInitialBrowseListSessionSnapshot();
  });
  const browseEverPaintedListRef = useRef(
    typeof window !== "undefined" && !!(readInitialBrowseListSessionSnapshot()?.rows.length)
  );
  const [listSort, setListSort] = useState<StoreBrowseSortId>(() =>
    parseStoreBrowseSortParam(searchParams?.get("sort"))
  );
  /** browse `user_lat`/`user_lng` — 주소 기본→프로필→GPS 순으로 matrix ETA·직선 거리 */
  const [browseUserGeo, setBrowseUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryRideTimeSource, setDeliveryRideTimeSource] = useState("google");

  const browseUserGeoRef = useRef(browseUserGeo);
  useEffect(() => {
    browseUserGeoRef.current = browseUserGeo;
  }, [browseUserGeo]);

  useEffect(() => {
    if (!browseDistanceCoordsEnabled) return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    let seq = 0;
    const commitGeo = (next: { lat: number; lng: number } | null) => {
      if (browseListUserOriginCoordsEqual(browseUserGeoRef.current, next)) return;
      setBrowseUserGeo(next);
    };
    const run = () => {
      const my = ++seq;
      void (async () => {
        const c = await resolveBrowseListUserOriginCoords();
        if (cancelled || my !== seq) return;
        commitGeo(c);
      })();
    };
    run();
    const onRefresh = () => run();
    const onBootProfile = () => run();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
    window.addEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onRefresh);
    window.addEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBootProfile);
    return () => {
      cancelled = true;
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onRefresh);
      window.removeEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onRefresh);
      window.removeEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBootProfile);
    };
  }, [browseDistanceCoordsEnabled]);

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
  }, [primarySlug, taxonomy]);

  const subs = useBrowseSubIndustries(primarySlug);

  useBrowseSubAllCanonicalUrl(primarySlug, subs);

  const optimisticSub = useSyncExternalStore(
    subscribeBrowseSubChipOptimisticSub,
    getBrowseSubChipOptimisticSubSnapshot,
    getBrowseSubChipOptimisticSubServerSnapshot
  );
  const listRefreshTick = useSyncExternalStore(
    subscribeBrowseListRefresh,
    getBrowseListRefreshSnapshot,
    getBrowseListRefreshServerSnapshot
  );
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

  /** `sub=all`·없음 → 목록 API `all` (2차 「전체」 칩 없음) */
  const matchedTopicSlug = useMemo(
    () => resolveBrowseMatchedSubSlug(trimmedBrowseSubParam, subs),
    [trimmedBrowseSubParam, subs],
  );

  useEffect(() => {
    setListSort(parseStoreBrowseSortParam(searchParams?.get("sort")));
  }, [searchParams]);

  useEffect(() => {
    // URL/searchParams가 확정되면 optimistic 상태를 해제
    setBrowseSubChipOptimisticSub(null);
  }, [matchedTopicSlug, primarySlug]);

  useEffect(() => () => setBrowseSubChipOptimisticSub(null), []);

  const activeSub = resolveBrowseListQuerySub(trimmedBrowseSubParam, optimisticSub, matchedTopicSlug);

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
    // 뒤로가기(popstate) 복귀 계측 — 동기 핸들러 부담 최소화
    const onPop = () => {
      queueMicrotask(() => {
        const sp = searchParams?.get("sub");
        const sub =
          typeof sp === "string" && sp.trim()
            ? storesBrowseNavSubSlug(sp.trim().toLowerCase())
            : STORES_BROWSE_SUB_ALL;
        lastNavPerfRef.current = { sub, t0: performance.now(), kind: "pop" };
      });
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
      browseDistanceCoordsEnabled &&
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
    browseDistanceCoordsEnabled,
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
        browseDistanceCoordsEnabled && browseUserGeo ? `${browseUserGeo.lat.toFixed(4)},${browseUserGeo.lng.toFixed(4)}` : "",
      ].join("|"),
    [primarySlug, activeSub, primaryRegion?.regionId, primaryRegion?.cityId, primaryRegion?.barangay, browseDistanceCoordsEnabled, browseUserGeo]
  );

  /** prewarm·pointerdown 은 geo 없는 키 — 마운트 직후 동기 peek 폴백 */
  const browseQuerySuffixWithoutGeo = useMemo(() => {
    const sp = new URLSearchParams(browseQuerySuffix);
    sp.delete("user_lat");
    sp.delete("user_lng");
    return sp.toString();
  }, [browseQuerySuffix]);
  const prevBrowseListContextKeyRef = useRef<string | null>(null);
  const browseHadListForContextRef = useRef(browseEverPaintedListRef.current);
  const remoteCacheRef = useRef<
    Map<string, { rows: BrowseStoreListItem[]; source: BrowseFeedMetaSource }>
  >(new Map());
  const loadRemoteRequestIdRef = useRef(0);
  const browseListContextKeyRef = useRef(browseListContextKey);
  useEffect(() => {
    browseListContextKeyRef.current = browseListContextKey;
  }, [browseListContextKey]);

  const browseQuerySuffixRef = useRef(browseQuerySuffix);
  useEffect(() => {
    browseQuerySuffixRef.current = browseQuerySuffix;
  }, [browseQuerySuffix]);

  const peekBrowsePaintCache = useCallback(
    (queryString: string) =>
      peekStoresBrowseListPaintCache(queryString, language, (qs, lang) =>
        peekStoresBrowseClientCache(qs, { language: lang as typeof language })
      ),
    [language]
  );

  const loadRemote = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = !!opts?.silent;
      const force = !!opts?.force;
      const requestId = ++loadRemoteRequestIdRef.current;
      const contextKeyAtStart = browseListContextKeyRef.current;
      const qsAtStart = browseQuerySuffixRef.current;
      if (!silent && !browseEverPaintedListRef.current) {
        setRemoteLoading(true);
        setFeedSource((prev) => (prev === null ? prev : null));
      }
      try {
        const qs = force
          ? `${qsAtStart}${qsAtStart.includes("?") ? "&" : "?"}fresh=1`
          : qsAtStart;
        const { json } = await fetchStoresBrowseDeduped(qs, { language });
        if (
          requestId !== loadRemoteRequestIdRef.current ||
          contextKeyAtStart !== browseListContextKeyRef.current
        ) {
          return;
        }
        const j = json as {
          ok?: boolean;
          stores?: unknown;
          meta?: { source?: string; delivery_ride_time_source?: string };
        };
        const src = j?.meta?.source;
        const rideSrc = j?.meta?.delivery_ride_time_source?.trim();
        if (rideSrc) setDeliveryRideTimeSource(rideSrc);
        const okSources = src === "supabase" || src === "supabase_unconfigured";
        if (j?.ok && Array.isArray(j.stores) && okSources) {
          const rows = j.stores as BrowseStoreListItem[];
          const source = src as BrowseFeedMetaSource;
          remoteCacheRef.current.set(browseListContextKeyRef.current, { rows, source });
          setRemoteRows(rows);
          setFeedSource(source);
          browseHadListForContextRef.current = true;
          if (rows.length > 0) {
            browseEverPaintedListRef.current = true;
            writeStoresBrowseSessionCache(qsAtStart, language, { rows, source });
          }
        } else {
          setRemoteRows([]);
          setFeedSource(null);
          if (!silent) browseHadListForContextRef.current = false;
        }
      } catch {
        if (
          requestId !== loadRemoteRequestIdRef.current ||
          contextKeyAtStart !== browseListContextKeyRef.current
        ) {
          return;
        }
        if (!silent) {
          setRemoteRows([]);
          setFeedSource((prev) => (prev === null ? prev : null));
          browseHadListForContextRef.current = false;
        }
      } finally {
        if (
          requestId === loadRemoteRequestIdRef.current &&
          contextKeyAtStart === browseListContextKeyRef.current
        ) {
          setRemoteLoading(false);
        }
      }
    },
    [language]
  );

  const loadRemoteRef = useRef(loadRemote);
  useEffect(() => {
    loadRemoteRef.current = loadRemote;
  }, [loadRemote]);

  useLayoutEffect(() => {
    const fromRef = remoteCacheRef.current.get(browseListContextKey);
    const fromClient =
      peekBrowsePaintCache(browseQuerySuffix) ?? peekBrowsePaintCache(browseQuerySuffixWithoutGeo);
    const cached = fromRef ?? fromClient;
    if (!cached) return;
    setRemoteRows(cached.rows);
    setFeedSource(cached.source);
    setRemoteLoading(false);
    browseHadListForContextRef.current = true;
    if (cached.rows.length > 0) browseEverPaintedListRef.current = true;
    remoteCacheRef.current.set(browseListContextKey, cached);
  }, [browseListContextKey, browseQuerySuffix, browseQuerySuffixWithoutGeo, peekBrowsePaintCache]);

  useEffect(() => {
    const prevKey = prevBrowseListContextKeyRef.current;
    const ctxChanged = prevKey !== browseListContextKey;
    const geoOnlyChange =
      ctxChanged &&
      prevKey != null &&
      browseListContextKeyWithoutGeo(prevKey) === browseListContextKeyWithoutGeo(browseListContextKey);
    if (ctxChanged) {
      prevBrowseListContextKeyRef.current = browseListContextKey;
      if (!geoOnlyChange) {
        browseHadListForContextRef.current = false;
      } else if (prevKey) {
        const prevCached = remoteCacheRef.current.get(prevKey);
        if (prevCached && !remoteCacheRef.current.has(browseListContextKey)) {
          remoteCacheRef.current.set(browseListContextKey, prevCached);
        }
      }
    }
    let cached = remoteCacheRef.current.get(browseListContextKey);
    if (!cached) {
      const paint =
        peekBrowsePaintCache(browseQuerySuffix) ?? peekBrowsePaintCache(browseQuerySuffixWithoutGeo);
      if (paint) {
        cached = paint;
        remoteCacheRef.current.set(browseListContextKey, paint);
      }
    }
    if (cached) {
      setRemoteRows(cached.rows);
      setFeedSource(cached.source);
      setRemoteLoading(false);
      browseHadListForContextRef.current = true;
      if (cached.rows.length > 0) browseEverPaintedListRef.current = true;
    } else if (ctxChanged && !geoOnlyChange) {
      setRemoteRows(undefined);
      setRemoteLoading(true);
    }
    const silent = !!cached || browseHadListForContextRef.current;
    void loadRemoteRef.current({ silent });
  }, [browseListContextKey, browseQuerySuffix, browseQuerySuffixWithoutGeo, peekBrowsePaintCache]);

  useEffect(() => {
    if (listRefreshTick === 0) return;
    void loadRemoteRef.current({ force: true, silent: false });
  }, [listRefreshTick]);

  useEffect(() => {
    setListSort("default");
  }, [activeSub, primarySlug]);

  useRefetchOnPageShowRestore(
    () => void loadRemoteRef.current({ silent: browseEverPaintedListRef.current, force: true }),
    {
      enableVisibilityRefetch: false,
    },
  );

  /** 거리 정책 OFF 기간에는 기본 목록에서 좌표 기반 정렬을 하지 않는다. */
  const hasGeo = browseDistanceCoordsEnabled && browseUserGeo != null;
  const listLoaded = remoteRows !== undefined;
  useDeliveryListScrollRestore(listScrollRouteKey, listLoaded);
  const useRemoteList = listLoaded && remoteRows.length > 0;
  const sortedRemoteRows = useMemo(() => {
    if (!remoteRows?.length) return remoteRows;
    return sortBrowseStores(remoteRows, listSort, hasGeo, language);
  }, [remoteRows, listSort, hasGeo, language]);

  const browseRowCardCacheRef = useRef<Map<string, StoreRowCardData>>(new Map());
  const browseRowCardListRef = useRef<StoreRowCardData[] | null>(null);

  useEffect(() => {
    remoteCacheRef.current.clear();
    browseRowCardCacheRef.current.clear();
    browseRowCardListRef.current = null;
  }, [language]);

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

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  const otherPrimaries = useMemo(
    () => listBrowsePrimaryIndustries().filter((p) => p.slug.toLowerCase() !== primarySlug.toLowerCase()),
    [primarySlug]
  );

  const browseListReady = !!primary;

  const onBrowsePullRefresh = useCallback(async () => {
    invalidateStoresBrowseMemoryCache(primarySlug);
    invalidateStoresBrowseClientCache(browseQuerySuffix, language);
    invalidateStoresBrowseClientCache(browseQuerySuffixWithoutGeo, language);
    invalidateStoresBrowseSessionCache(browseQuerySuffix, language);
    invalidateStoresBrowseSessionCache(browseQuerySuffixWithoutGeo, language);
    browseEverPaintedListRef.current = false;
    forgetStoresBrowseFetchSingleFlight(browseQuerySuffix, language);
    forgetStoresBrowseFetchSingleFlight(browseQuerySuffixWithoutGeo, language);
    remoteCacheRef.current.delete(browseListContextKey);
    await Promise.all([
      reloadBrowseTaxonomySnapshot(language),
      loadRemote({ silent: false, force: true }),
    ]);
  }, [
    browseListContextKey,
    browseQuerySuffix,
    browseQuerySuffixWithoutGeo,
    language,
    loadRemote,
    primarySlug,
  ]);

  const browseStickyBelow: ReactNode = useMemo(
    () => (
      <>
        <StoresBrowsePullRefreshHint />
        <div className="border-b border-sam-border bg-[#eac784]">
          <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pb-2 pt-2`}>
            <StoreListFilters sort={listSort} onSortChange={setListSort} hasGeo={hasGeo} />
          </div>
        </div>
      </>
    ),
    [listSort, hasGeo]
  );

  const browseHeaderTitle = useMemo(() => {
    if (!primary) return "";
    return resolveStorePrimaryIndustryLabel(language, primary.slug, primary.nameKo);
  }, [primary, language]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    if (!primary) {
      setMainTier1Extras(null);
      return () => setMainTier1Extras(null);
    }

    setMainTier1Extras({
      tier1: { titleText: browseHeaderTitle },
      stickyBelow: browseStickyBelow,
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, primary, browseStickyBelow, browseHeaderTitle]);

  if (!primary) {
    return (
      <div className={`min-h-[40vh] ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}>
        <div className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} pt-4`}>
          <p className="text-sm text-sam-muted">{t("store_invalid_industry")}</p>
          <Link href="/stores" className="mt-4 inline-block text-sm text-signature">
            {t("store_browse_home_link")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-[50vh] bg-sam-app ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS} dark:bg-[#18191A]`}>
      <BrowseSubtopicCollapseSentinel routeKey={subtopicCollapseRouteKey} />
      <div className="pt-3">
      {browseListReady ?
        <StoresBrowsePullRefreshRegister onRefresh={onBrowsePullRefresh} />
      : null}
      <section className={`${APP_MAIN_COLUMN_CLASS} ${PHILIFE_FEED_INSET_X_CLASS} space-y-4 pt-2`}>
        {remoteRows === undefined ?
          <StoreDeliveryListLoading />
        : useRemoteList ?
          <ul className="space-y-2">
            {storeDeliveryRowDataList.map((data) => (
              <StoreDeliveryRowCard
                key={data.slug}
                data={data}
                locale={language}
                deliveryRideTimeSource={deliveryRideTimeSource}
              />
            ))}
          </ul>
        : showEmptyBlock ?
          <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-10 text-center dark:border-sam-border dark:bg-[#242526]">
            <p className="text-sm text-sam-muted dark:text-sam-meta">{t("store_empty_store_list")}</p>
            <p className="mt-1 text-xs text-sam-meta dark:text-sam-muted">
              {feedSource === "supabase_unconfigured" ?
                t("store_browse_empty_preparing")
              : t("store_browse_empty_hint")}
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
                      {resolveStorePrimaryIndustryLabel(language, p.slug, p.nameKo)}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/stores#store-industry-explore"
                  className="mt-4 inline-block sam-text-body-secondary font-semibold text-signature"
                >
                  {t("store_browse_industry_map_link")}
                </Link>
              </div>
            : null}
          </div>
        : null}
      </section>
      </div>
    </div>
  );
}
