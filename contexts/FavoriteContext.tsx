"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { fetchFavoritePostIds } from "@/lib/favorites/favorites-client";
import {
  POST_FAVORITE_CHANGED_EVENT,
  type PostFavoriteChangedDetail,
} from "@/lib/favorites/post-favorite-events";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import { logEvent } from "@/lib/recommendation/recommendation-behavior-state";
import { recordConversionByProduct } from "@/lib/recommendation-analytics/recommendation-analytics-state";

type FavoriteContextValue = {
  favoriteIds: string[];
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
};

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

export function FavoriteProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    const user = getCurrentUser();
    return user?.id?.trim() || null;
  });
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    const syncUser = () => {
      const user = getCurrentUser();
      setCurrentUserId(user?.id?.trim() || null);
    };
    syncUser();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncUser);
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setFavoriteIds([]);
      return;
    }
    let cancelled = false;
    void fetchFavoritePostIds(currentUserId).then((ids) => {
      if (!cancelled) setFavoriteIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    const onFav = (event: Event) => {
      const detail = (event as CustomEvent<PostFavoriteChangedDetail>).detail;
      const postId = typeof detail?.postId === "string" ? detail.postId.trim() : "";
      if (!postId || typeof detail?.isFavorite !== "boolean") return;
      setFavoriteIds((prev) => {
        const has = prev.includes(postId);
        if (detail.isFavorite && !has) return [...prev, postId];
        if (!detail.isFavorite && has) return prev.filter((id) => id !== postId);
        return prev;
      });
    };
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
  }, []);

  const isFavorite = useCallback(
    (productId: string) => favoriteIds.includes(productId),
    [favoriteIds]
  );

  const toggle = useCallback((productId: string) => {
    const uid = currentUserIdRef.current;
    if (!uid) return;

    let wasFavorite = false;
    setFavoriteIds((prev) => {
      wasFavorite = prev.includes(productId);
      return wasFavorite ? prev.filter((id) => id !== productId) : [...prev, productId];
    });

    void toggleFavorite(productId).then((result) => {
      if (!result.ok) {
        setFavoriteIds((prev) => {
          const has = prev.includes(productId);
          if (wasFavorite && !has) return [...prev, productId];
          if (!wasFavorite && has) return prev.filter((id) => id !== productId);
          return prev;
        });
        return;
      }
      const nowFavorite = result.isFavorite === true;
      setFavoriteIds((prev) => {
        const has = prev.includes(productId);
        if (nowFavorite && !has) return [...prev, productId];
        if (!nowFavorite && has) return prev.filter((id) => id !== productId);
        return prev;
      });
      if (nowFavorite) {
        logEvent({
          userId: uid,
          eventType: "favorite_add",
          productId,
          targetId: productId,
        });
        recordConversionByProduct(uid, productId);
      } else {
        logEvent({
          userId: uid,
          eventType: "favorite_remove",
          productId,
          targetId: productId,
        });
      }
    });
  }, []);

  const value = useMemo(
    () => ({ favoriteIds, isFavorite, toggle }),
    [favoriteIds, isFavorite, toggle]
  );

  return (
    <FavoriteContext.Provider value={value}>
      {children}
    </FavoriteContext.Provider>
  );
}

export function useFavorite() {
  const ctx = useContext(FavoriteContext);
  if (!ctx) throw new Error("useFavorite must be used within FavoriteProvider");
  return ctx;
}
