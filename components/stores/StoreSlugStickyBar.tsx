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

  const storeRoot = `/stores/${encodeURIComponent(decoded)}`;
  const infoPath = `/stores/${encodeURIComponent(decoded)}/info`;
  const fallbackHref =
    pathname === infoPath || (pathname?.startsWith(`${infoPath}/`) ?? false) ? storeRoot : "/stores";

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

  return (
    <div className={`${STORE_DETAIL_STICKY_HEADER} ${STORE_DETAIL_STICKY_TOP_SAFE} w-full`}>
      <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
        {loading || !store ? (
          <div className="flex min-h-[52px] items-center gap-1.5 py-1">
            <StoreDetailBackLink fallbackHref={fallbackHref} />
            <div className="min-w-0 flex-1 py-0.5">
              {loading ? (
                <p className="text-[13px] text-stone-400">불러오는 중…</p>
              ) : (
                <p className="truncate text-[15px] font-semibold text-stone-600">{decoded}</p>
              )}
            </div>
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
          />
        )}
      </div>
    </div>
  );
}
