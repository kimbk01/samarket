/**
 * 13단계: 관리자 상품 필터·검색·정렬
 */

import type { Product, ProductStatus } from "@/lib/types/product";

export const STATUS_OPTIONS: { value: ProductStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "판매완료" },
  { value: "hidden", label: "숨김" },
  { value: "blinded", label: "블라인드" },
  { value: "deleted", label: "삭제" },
];

export type AdminProductSortKey =
  | "latest"
  | "updated"
  | "likes"
  | "chats";

export const SORT_OPTIONS: { value: AdminProductSortKey; label: string }[] = [
  { value: "latest", label: "최신 등록순" },
  { value: "updated", label: "최근 수정순" },
  { value: "likes", label: "찜 많은순" },
  { value: "chats", label: "채팅 많은순" },
];

export interface AdminProductFilters {
  status: ProductStatus | "";
  category: string;
  location: string;
  sortKey: AdminProductSortKey;
}

export function filterAndSortProducts(
  products: Product[],
  filters: AdminProductFilters,
  searchQuery: string
): Product[] {
  let list = [...products];

  if (filters.status) {
    list = list.filter((p) => p.status === filters.status);
  }
  if (filters.category.trim()) {
    list = list.filter(
      (p) => p.category?.toLowerCase().includes(filters.category.trim().toLowerCase())
    );
  }
  if (filters.location.trim()) {
    list = list.filter((p) =>
      p.location.toLowerCase().includes(filters.location.trim().toLowerCase())
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter((p) => {
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchSeller = p.seller?.nickname?.toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      return matchTitle || matchSeller || matchId;
    });
  }

  const key = filters.sortKey;
  list.sort((a, b) => {
    if (key === "latest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (key === "updated") {
      const au = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt).getTime();
      const bu = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt).getTime();
      return bu - au;
    }
    if (key === "likes") {
      return (b.likesCount ?? 0) - (a.likesCount ?? 0);
    }
    if (key === "chats") {
      return (b.chatCount ?? 0) - (a.chatCount ?? 0);
    }
    return 0;
  });

  return list;
}

/** 카테고리 목록 (실제 데이터에서 추출) */
export function getCategoryOptions(products: Product[]): string[] {
  const set = new Set<string>();
  products.forEach((p) => {
    if (p.category?.trim()) set.add(p.category.trim());
  });
  return Array.from(set).sort();
}
