"use client";

import { useCallback, useEffect, useState } from "react";
import {
  STORE_FAVORITE_CHANGED_EVENT,
  type StoreFavoriteChangedDetail,
} from "@/lib/stores/store-favorite-events";
import { fetchStoreFavoriteMutation } from "@/lib/stores/store-delivery-api-client";

export type StoreFavoriteToggleSeed = {
  viewerFavorited: boolean;
  favoriteCount: number;
};

/**
 * 매장 공개 페이지 헤더·카드 공통 — 즐겨찾기 토글(낙관적 업데이트 + 커스텀 이벤트 동기화).
 */
export function useStoreFavoriteToggle(slugForRequest: string, seed: StoreFavoriteToggleSeed) {
  const decoded = (slugForRequest || "").trim();
  const [viewerFavorited, setViewerFavorited] = useState(seed.viewerFavorited);
  const [favoriteCount, setFavoriteCount] = useState(seed.favoriteCount);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  useEffect(() => {
    setViewerFavorited(seed.viewerFavorited);
    setFavoriteCount(seed.favoriteCount);
  }, [seed.viewerFavorited, seed.favoriteCount]);

  useEffect(() => {
    const onFav = (e: Event) => {
      const d = (e as CustomEvent<StoreFavoriteChangedDetail>).detail;
      if (!d || d.slug !== decoded) return;
      setFavoriteCount(Number(d.favorite_count) || 0);
      setViewerFavorited(!!d.favorited);
    };
    window.addEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(STORE_FAVORITE_CHANGED_EVENT, onFav);
  }, [decoded]);

  const toggleFavorite = useCallback(async () => {
    if (favoriteBusy || !decoded) return;
    const prevFavorited = viewerFavorited;
    const prevFavoriteCount = favoriteCount;
    const nextFavorited = !prevFavorited;
    const nextFavoriteCount = Math.max(0, prevFavoriteCount + (nextFavorited ? 1 : -1));
    setFavoriteBusy(true);
    setViewerFavorited(nextFavorited);
    setFavoriteCount(nextFavoriteCount);
    window.dispatchEvent(
      new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
        detail: { slug: decoded, favorited: nextFavorited, favorite_count: nextFavoriteCount },
      })
    );
    try {
      const method = prevFavorited ? "DELETE" : "POST";
      const { status, json } = await fetchStoreFavoriteMutation(decoded, method);
      if (status === 401) {
        setViewerFavorited(prevFavorited);
        setFavoriteCount(prevFavoriteCount);
        window.dispatchEvent(
          new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
            detail: { slug: decoded, favorited: prevFavorited, favorite_count: prevFavoriteCount },
          })
        );
        window.alert("로그인이 필요합니다.");
        return;
      }
      const favJ = json as { ok?: boolean; favorited?: boolean; favorite_count?: unknown };
      if (!favJ?.ok) {
        setViewerFavorited(prevFavorited);
        setFavoriteCount(prevFavoriteCount);
        window.dispatchEvent(
          new CustomEvent<StoreFavoriteChangedDetail>(STORE_FAVORITE_CHANGED_EVENT, {
            detail: { slug: decoded, favorited: prevFavorited, favorite_count: prevFavoriteCount },
          })
        );
        return;
      }
      const favorited = !!favJ.favorited;
      const favorite_count = Number(favJ.favorite_count) || 0;
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
  }, [favoriteBusy, viewerFavorited, favoriteCount, decoded]);

  return { viewerFavorited, favoriteCount, favoriteBusy, toggleFavorite };
}
