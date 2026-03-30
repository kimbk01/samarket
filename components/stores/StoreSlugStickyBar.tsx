"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { usePathname } from "next/navigation";
import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import { StoreDetailStickyTopRow } from "@/components/stores/StoreDetailStickyTopRow";
import {
  STORE_FAVORITE_CHANGED_EVENT,
  type StoreFavoriteChangedDetail,
} from "@/lib/stores/store-favorite-events";
import {
  STORE_DETAIL_STICKY_HEADER,
  STORE_DETAIL_STICKY_TOP_SAFE,
} from "@/lib/stores/store-detail-ui";
import { APP_TIER1_BAR_INNER_ALIGNED_CLASS } from "@/lib/ui/app-content-layout";
import { formatStoreLocationLine } from "@/lib/stores/store-location-label";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import {
  readStoreFulfillmentPref,
  writeStoreFulfillmentPref,
  STORE_FULFILLMENT_PREF_CHANGED_EVENT,
  type StoreFulfillmentPrefChangedDetail,
} from "@/lib/stores/store-fulfillment-pref";

type StoreHead = {
  id: string;
  store_name: string;
  slug: string;
  phone: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  profile_image_url: string | null;
  rating_avg?: number | null;
  review_count?: number | null;
  business_hours_json?: unknown;
  is_open?: boolean | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
};

export function StoreSlugStickyBar({ slug }: { slug: string }) {
  const pathname = usePathname();
  const decoded = decodeURIComponent((slug || "").trim());

  const [store, setStore] = useState<StoreHead | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerFavorited, setViewerFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [recentOrderCount, setRecentOrderCount] = useState(0);
  const [openTick, setOpenTick] = useState(0);
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup" | "local_delivery">("pickup");

  const storeRoot = `/stores/${encodeURIComponent(decoded)}`;
  const infoPath = `/stores/${encodeURIComponent(decoded)}/info`;
  const fallbackHref =
    pathname === infoPath || (pathname?.startsWith(`${infoPath}/`) ?? false) ? storeRoot : "/stores";

  const isStoreMenuRoot = pathname === storeRoot;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setOpenTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /** sessionStorage·이벤트 detail은 API `store.slug` 기준. URL `decoded`와 다를 수 있어 둘 다 매칭 */
  const prefKey = (store?.slug ?? decoded).trim();

  useEffect(() => {
    if (!prefKey) return;
    const v = readStoreFulfillmentPref(prefKey);
    if (v) setFulfillmentMode(v);
  }, [prefKey]);

  useEffect(() => {
    const onPref = (e: Event) => {
      const d = (e as CustomEvent<StoreFulfillmentPrefChangedDetail>).detail;
      if (!d) return;
      const ev = d.slug.trim();
      const dec = decoded.trim();
      const api = store?.slug?.trim() ?? "";
      const match =
        ev === dec ||
        (!!api && ev === api) ||
        ev.toLowerCase() === dec.toLowerCase() ||
        (!!api && ev.toLowerCase() === api.toLowerCase());
      if (!match) return;
      setFulfillmentMode(d.mode);
    };
    window.addEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, onPref);
    return () => window.removeEventListener(STORE_FULFILLMENT_PREF_CHANGED_EVENT, onPref);
  }, [decoded, store?.slug]);

  /** 배달/포장 자동 보정은 `StoreDetailPublic` 한 곳에서만 수행(이중 write·이벤트 중복 방지) */

  const loadSticky = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!decoded) {
        if (!silent) {
          setLoading(false);
          setStore(null);
        }
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(decoded)}`, { cache: "no-store" });
        const json = await res.json();
        if (!json?.ok || !json.store) {
          if (!silent) {
            setStore(null);
            setFavoriteCount(0);
            setRecentOrderCount(0);
          }
        } else {
          setStore(json.store as StoreHead);
          setViewerFavorited(!!json.meta?.viewer_favorited);
          setFavoriteCount(Number(json.meta?.favorite_count) || 0);
          setRecentOrderCount(Number(json.meta?.recent_order_count) || 0);
        }
      } catch {
        if (!silent) setStore(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [decoded]
  );

  useEffect(() => {
    void loadSticky();
  }, [loadSticky]);

  useRefetchOnPageShowRestore(() => void loadSticky({ silent: true }));

  useEffect(() => {
    const onFav = (e: Event) => {
      const d = (e as CustomEvent<StoreFavoriteChangedDetail>).detail;
      if (!d || d.slug !== decoded) return;
      setFavoriteCount(Number(d.favorite_count) || 0);
    };
    window.addEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
  }, [decoded]);

  const toggleFavorite = useCallback(async () => {
    if (favoriteBusy || !decoded) return;
    setFavoriteBusy(true);
    try {
      const method = viewerFavorited ? "DELETE" : "POST";
      const res = await fetch(`/api/stores/${encodeURIComponent(decoded)}/favorite`, {
        method,
        credentials: "include",
      });
      const json = await res.json();
      if (res.status === 401) {
        window.alert("로그인이 필요합니다.");
        return;
      }
      if (!json?.ok) return;
      const favorited = !!json.favorited;
      const favorite_count = Number(json.favorite_count) || 0;
      setViewerFavorited(favorited);
      setFavoriteCount(favorite_count);
      window.dispatchEvent(
        new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
          detail: { slug: decoded, favorited, favorite_count },
        })
      );
    } finally {
      setFavoriteBusy(false);
    }
  }, [favoriteBusy, viewerFavorited, decoded]);

  const locationSubtitle = store ? formatStoreLocationLine(store) : null;

  const commerceState = store
    ? resolveStoreFrontCommerceState(store.business_hours_json, store.is_open ?? null)
    : null;
  void openTick;
  const isOpenForOrder = commerceState?.isOpenForCommerce ?? true;
  const deliveryAvailable = store?.delivery_available === true;
  const pickupAvailable = store?.pickup_available !== false;

  const onMenuSearchFocus = useCallback(() => {
    const el = document.getElementById("store-menu-search");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      el?.focus();
      if (el && "select" in el && typeof (el as HTMLInputElement).select === "function") {
        (el as HTMLInputElement).select();
      }
    }, 280);
  }, []);

  const orderChrome =
    isStoreMenuRoot && store
      ? {
          isOpenForOrder,
          deliveryAvailable,
          pickupAvailable,
          fulfillmentMode,
          onFulfillmentChange: (mode: "pickup" | "local_delivery") => {
            writeStoreFulfillmentPref(store.slug, mode);
          },
          onMenuSearchFocus,
        }
      : null;

  return (
    <div className={`${STORE_DETAIL_STICKY_HEADER} ${STORE_DETAIL_STICKY_TOP_SAFE} w-full`}>
      <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
        {loading || !store ? (
          <div
            className={`flex flex-col gap-1 py-0.5 ${isStoreMenuRoot ? "min-h-[84px]" : "min-h-[44px]"}`}
          >
            <div className="flex min-h-[40px] items-center gap-1.5">
              <StoreDetailBackLink fallbackHref={fallbackHref} />
              <div className="min-w-0 flex-1 py-0.5">
                {loading ? (
                  <p className="text-[13px] text-stone-400">불러오는 중…</p>
                ) : (
                  <p className="truncate text-[15px] font-semibold text-stone-600">{decoded}</p>
                )}
              </div>
            </div>
            {isStoreMenuRoot && loading ? (
              <div className="h-8 w-full animate-pulse rounded-lg bg-stone-100" aria-hidden />
            ) : null}
          </div>
        ) : (
          <StoreDetailStickyTopRow
            fallbackHref={fallbackHref}
            commerceCartStoreId={store.id}
            storeSlug={store.slug}
            storeName={store.store_name}
            areaLine={locationSubtitle}
            phone={store.phone}
            profileImageUrl={store.profile_image_url}
            ratingAvg={
              store.rating_avg != null && Number.isFinite(Number(store.rating_avg))
                ? Number(store.rating_avg)
                : null
            }
            reviewCount={Number(store.review_count) || 0}
            favoriteCount={favoriteCount}
            recentOrderCount={recentOrderCount}
            viewerFavorited={viewerFavorited}
            favoriteBusy={favoriteBusy}
            onFavoriteClick={toggleFavorite}
            orderChrome={orderChrome}
          />
        )}
      </div>
    </div>
  );
}
