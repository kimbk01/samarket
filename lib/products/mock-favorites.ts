/**
 * 7단계: 찜 mock (Supabase 연동 시 교체)
 */

import type { ProductFavorite, FavoriteProduct } from "@/lib/types/favorite";
import type { Product } from "@/lib/types/product";
import { getProductById } from "@/lib/mock-products";

const CURRENT_USER_ID = "me";

/** 찜 목록 (userId + productId 기준) */
export const MOCK_FAVORITES: ProductFavorite[] = [
  { id: "fav-1", userId: CURRENT_USER_ID, productId: "1", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: "fav-2", userId: CURRENT_USER_ID, productId: "3", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { id: "fav-3", userId: CURRENT_USER_ID, productId: "4", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() },
];

export function getCurrentUserId(): string {
  return CURRENT_USER_ID;
}

export function getFavoriteProductIds(userId: string): string[] {
  return MOCK_FAVORITES.filter((f) => f.userId === userId).map((f) => f.productId);
}

export function addFavorite(userId: string, productId: string): void {
  if (MOCK_FAVORITES.some((f) => f.userId === userId && f.productId === productId)) return;
  MOCK_FAVORITES.push({
    id: `fav-${Date.now()}`,
    userId,
    productId,
    createdAt: new Date().toISOString(),
  });
}

export function removeFavorite(userId: string, productId: string): void {
  const idx = MOCK_FAVORITES.findIndex((f) => f.userId === userId && f.productId === productId);
  if (idx !== -1) MOCK_FAVORITES.splice(idx, 1);
}

export function isFavorite(userId: string, productId: string): boolean {
  return MOCK_FAVORITES.some((f) => f.userId === userId && f.productId === productId);
}

function productToFavoriteProduct(p: Product, favoritedAt: string): FavoriteProduct {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: p.location,
    createdAt: p.createdAt,
    status: p.status,
    thumbnail: p.thumbnail ?? "",
    likesCount: p.likesCount,
    chatCount: p.chatCount,
    isBoosted: p.isBoosted,
    sellerId: p.sellerId,
    favoritedAt,
  };
}

/** 찜한 상품 목록 (삭제/숨김은 제외, 상품 없으면 스킵) */
export function getFavoriteProducts(userId: string): FavoriteProduct[] {
  const list: FavoriteProduct[] = [];
  const favs = MOCK_FAVORITES.filter((f) => f.userId === userId);
  for (const fav of favs) {
    const product = getProductById(fav.productId);
    if (!product || product.status === "hidden") continue;
    list.push(productToFavoriteProduct(product, fav.createdAt));
  }
  return list;
}
