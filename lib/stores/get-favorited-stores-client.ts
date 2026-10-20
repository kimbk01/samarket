"use client";

import type { FavoritedStoreListItem } from "@/lib/stores/favorited-store-types";

export type GetFavoritedStoresResult = {
  items: FavoritedStoreListItem[];
  authenticated: boolean;
  /**
   * 서버·네트워크 오류 — 「매장 찜 없음」·「로그인 필요」와 구분해 오류·재시도로 표시(최종 설계 S22).
   * 로그인 이동은 401(또는 200 `authenticated:false`)일 때만.
   */
  error?: boolean;
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
    if (res.status === 401) {
      return { items: [], authenticated: false };
    }
    if (!res.ok) {
      return { items: [], authenticated: true, error: true };
    }
    const authenticated = d.authenticated === true;
    return { items, authenticated };
  } catch {
    return { items: [], authenticated: true, error: true };
  }
}
