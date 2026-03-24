"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  getFavoriteProductIds,
  addFavorite,
  removeFavorite,
  getCurrentUserId,
} from "@/lib/products/mock-favorites";
import { logEvent } from "@/lib/recommendation/mock-user-behavior-events";
import { recordConversionByProduct } from "@/lib/recommendation/mock-recommendation-impressions";

type FavoriteContextValue = {
  favoriteIds: string[];
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
};

const FavoriteContext = createContext<FavoriteContextValue | null>(null);

export function FavoriteProvider({ children }: { children: React.ReactNode }) {
  const currentUserId = getCurrentUserId();
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    getFavoriteProductIds(currentUserId)
  );

  const isFavorite = useCallback(
    (productId: string) => favoriteIds.includes(productId),
    [favoriteIds]
  );

  const toggle = useCallback(
    (productId: string) => {
      if (favoriteIds.includes(productId)) {
        removeFavorite(currentUserId, productId);
        setFavoriteIds((prev) => prev.filter((id) => id !== productId));
        logEvent({
          userId: currentUserId,
          eventType: "favorite_remove",
          productId,
          targetId: productId,
        });
      } else {
        addFavorite(currentUserId, productId);
        setFavoriteIds((prev) => [...prev, productId]);
        logEvent({
          userId: currentUserId,
          eventType: "favorite_add",
          productId,
          targetId: productId,
        });
        recordConversionByProduct(currentUserId, productId);
      }
    },
    [favoriteIds, currentUserId]
  );

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
