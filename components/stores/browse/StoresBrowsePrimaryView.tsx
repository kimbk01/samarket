"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
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
  listBrowseStoresForSub,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { BrowseDbStoreCard } from "./BrowseDbStoreCard";
import { storesBrowsePath } from "./stores-browse-paths";
import { allowStoresBrowseDemoFallback } from "@/lib/config/deploy-surface";
import { BrowseStoreCard } from "./BrowseStoreCard";

const CHIP_BASE =
  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors border";
const CHIP_OFF = "border-gray-200 bg-white text-gray-600";
const CHIP_ON = "border-signature bg-signature text-white";

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
    <Link
      href={cartHref}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-white/80"
      aria-label={cartLineKindCount > 0 ? "장바구니" : "매장"}
    >
      <StoreCommerceCartStrokeIcon className="h-5 w-5" />
      {cartLineKindCount > 0 ? (
        <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
          {cartLineKindCount > 99 ? "99+" : cartLineKindCount}
        </span>
      ) : null}
    </Link>
  );
}

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
  const [remoteRows, setRemoteRows] = useState<BrowseStoreListItem[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);

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

  const mockStores = useMemo(
    () => (activeSub ? listBrowseStoresForSub(primarySlug, activeSub) : []),
    [primarySlug, activeSub]
  );

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
          setRemoteRows(null);
          setRemoteLoading(false);
        }
        return;
      }
      if (!silent) {
        setRemoteLoading(true);
        setRemoteRows(null);
      }
      try {
        const res = await fetch(`/api/stores/browse?${browseQuerySuffix}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && json?.meta?.source === "supabase" && Array.isArray(json.stores)) {
          setRemoteRows(json.stores as BrowseStoreListItem[]);
        } else {
          if (!silent) setRemoteRows(null);
        }
      } catch {
        if (!silent) setRemoteRows(null);
      } finally {
        if (!silent) setRemoteLoading(false);
      }
    },
    [activeSub, browseQuerySuffix]
  );

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useRefetchOnPageShowRestore(() => void loadRemote({ silent: true }));

  const hasRemoteResponse = remoteRows !== null;
  const useRemoteList = hasRemoteResponse && remoteRows!.length > 0;
  /** production 에서는 항상 false. local/staging 은 deploy-surface + DEMO_FALLBACK env */
  const browseDemoFallbackOn = allowStoresBrowseDemoFallback();
  const showMockList =
    !useRemoteList &&
    mockStores.length > 0 &&
    (!hasRemoteResponse || browseDemoFallbackOn);
  const showDemoBanner =
    browseDemoFallbackOn &&
    hasRemoteResponse &&
    remoteRows!.length === 0 &&
    mockStores.length > 0;
  const showEmptyBlock = !useRemoteList && !showMockList;

  const scrollClass =
    "-mx-1 flex w-full min-w-0 flex-nowrap justify-start gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

  const browseSubtitle = useMemo(() => {
    if (!primary || subs.length === 0) return "";
    return useRemoteList
      ? "Supabase에 등록된 실매장입니다. 동네·위치 설정에 따라 정렬됩니다."
      : showDemoBanner
        ? "이 조건의 실매장은 0건입니다. 아래 데모로 UI를 확인할 수 있어요. 끄려면 .env에 NEXT_PUBLIC_STORES_BROWSE_DEMO_FALLBACK=0"
        : showEmptyBlock &&
            hasRemoteResponse &&
            remoteRows !== null &&
            remoteRows.length === 0 &&
            !browseDemoFallbackOn
          ? "실매장 0건이며 데모 폴백이 꺼져 있어 목록을 숨깁니다."
          : remoteLoading
            ? "실매장 목록을 불러오는 중…"
            : "하위 업종을 선택하면 비즈 업체가 필터됩니다. 실매장이 있으면 우선 표시되고, 없으면 데모를 볼 수 있습니다.";
  }, [
    primary,
    subs.length,
    useRemoteList,
    showDemoBanner,
    showEmptyBlock,
    hasRemoteResponse,
    remoteRows,
    browseDemoFallbackOn,
    remoteLoading,
  ]);

  if (!primary || subs.length === 0) {
    return (
      <div className="min-h-[40vh] pb-8">
        <TradePrimaryColumnStickyAppBar
          title="업종"
          backButtonProps={{ preferHistoryBack: true, backHref: "/stores", ariaLabel: "이전 화면" }}
          actions={<StoresBrowseCartAction />}
        />
        <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pt-4`}>
          <p className="text-sm text-gray-600">존재하지 않는 업종입니다.</p>
          <Link href="/stores" className="mt-4 inline-block text-sm text-signature">
            매장 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] pb-8">
      <TradePrimaryColumnStickyAppBar
        title={
          <>
            <span className="mr-1">{primary.symbol}</span>
            {primary.nameKo}
          </>
        }
        backButtonProps={{ preferHistoryBack: true, backHref: "/stores", ariaLabel: "이전 화면" }}
        actions={<StoresBrowseCartAction />}
        shellFooter={
          <>
            <p className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-1.5 pt-0 text-[11px] leading-snug text-gray-600`}>
              {browseSubtitle}
            </p>
            <div className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} pb-3`}>
              <HorizontalDragScroll
                className={scrollClass}
                style={{ WebkitOverflowScrolling: "touch" }}
                aria-label="하위 업종"
              >
                {subs.map((s) => {
                  const on = activeSub === s.slug;
                  return (
                    <Link
                      key={s.id}
                      href={storesBrowsePath(primarySlug, s.slug)}
                      scroll={false}
                      className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                      {s.nameKo}
                    </Link>
                  );
                })}
              </HorizontalDragScroll>
            </div>
          </>
        }
      />

      <section className={`${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS} mt-4 space-y-2`}>
        {remoteLoading && !hasRemoteResponse ? (
          <p className="py-4 text-center text-sm text-gray-500">실매장 연동 확인 중…</p>
        ) : null}
        {showDemoBanner ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-[12px] text-amber-950">
            <p>
              <span className="font-medium">데모 안내</span>
              <span className="text-amber-900/90">
                {" "}
                실데이터 0건일 때만 보이는 샘플 카드입니다. 운영 전에는{" "}
                <code className="rounded bg-amber-100/80 px-1">NEXT_PUBLIC_STORES_BROWSE_DEMO_FALLBACK=0</code> 로 끄면
                됩니다.
              </span>
            </p>
            <p className="mt-2 border-t border-amber-200/80 pt-2 text-[11px] leading-relaxed text-amber-950/95">
              <span className="font-medium">실매장이 있는데 0건이면</span> 매장 관리에서{" "}
              <span className="font-medium">업종·세부 주제(예: 식당 → 한식)</span>가 탭과 맞는지, 승인·노출 상태를
              확인해 주세요. 동네는 정렬에만 쓰이며 목록에서 제외하지 않습니다.
            </p>
          </div>
        ) : null}
        {useRemoteList ? (
          <ul className="space-y-2">
            {remoteRows!.map((s) => (
              <BrowseDbStoreCard key={s.id} store={s} />
            ))}
          </ul>
        ) : showEmptyBlock ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
            <p className="text-sm text-gray-600">표시할 매장이 없습니다.</p>
            <p className="mt-1 text-xs text-gray-400">
              실매장이 없거나 데모가 꺼져 있을 수 있습니다. 하위 업종을 바꿔 보세요. 내 매장이 있는데 비면 프로필의
              업종·세부 주제(한식 등)와 승인·노출을 확인해 주세요.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {mockStores.map((s) => (
              <BrowseStoreCard key={s.id} store={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
