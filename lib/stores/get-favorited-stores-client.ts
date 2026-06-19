"use client";

import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";

export type GetFavoritedStoresResult = {
  items: FavoritedStoreListItem[];
  authenticated: boolean;
};

/** 찜한 매장 — `/api/me/store-favorites/list` (쿠키 세션 기준) */
export async function getFavoritedStores(): Promise<GetFavoritedStoresResult> {
  try {
    const res = await fetch("/api/me/store-favorites/list", {
      credentials: "include",
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as {
      items?: unknown;
      authenticated?: unknown;
    };
    const items = Array.isArray(d.items) ? (d.items as FavoritedStoreListItem[]) : [];
    if (!res.ok) {
      return { items: [], authenticated: false };
    }
    const authenticated = d.authenticated === true;
    return { items, authenticated };
  } catch {
    return { items: [], authenticated: false };
  }
}
