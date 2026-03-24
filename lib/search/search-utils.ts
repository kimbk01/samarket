/**
 * 8단계: 검색·필터·정렬 유틸 (title, description, category, location 대상)
 */

import type { Product } from "@/lib/types/product";

export type SearchSortKey =
  | "latest"
  | "popular"
  | "nearby"
  | "price_asc"
  | "price_desc";

export const SEARCH_SORT_OPTIONS: { value: SearchSortKey; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "nearby", label: "가까운순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
];

export function filterByKeyword(
  products: Product[],
  keyword: string
): Product[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return products;
  return products.filter((p) => {
    const title = (p.title ?? "").toLowerCase();
    const desc = (p.description ?? "").toLowerCase();
    const category = (p.category ?? "").toLowerCase();
    const location = (p.location ?? "").toLowerCase();
    return (
      title.includes(k) ||
      desc.includes(k) ||
      category.includes(k) ||
      location.includes(k)
    );
  });
}

export function filterByRegionName(
  products: Product[],
  regionName: string
): Product[] {
  if (!regionName?.trim()) return products;
  const name = regionName.trim();
  return products.filter((p) => p.location?.includes(name));
}

export function filterByCategory(
  products: Product[],
  category: string
): Product[] {
  if (!category) return products;
  return products.filter((p) => p.category === category);
}

export function filterByStatus(
  products: Product[],
  status: string
): Product[] {
  if (!status || status === "all") return products;
  return products.filter((p) => p.status === status);
}

export function sortSearchResults(
  products: Product[],
  sortKey: SearchSortKey
): Product[] {
  const list = [...products];
  switch (sortKey) {
    case "latest":
      return list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "popular":
      return list.sort(
        (a, b) => b.likesCount + b.chatCount - (a.likesCount + a.chatCount)
      );
    case "nearby":
      return list.sort((a, b) => {
        const da = a.distance ?? 999;
        const db = b.distance ?? 999;
        return da - db;
      });
    case "price_asc":
      return list.sort((a, b) => a.price - b.price);
    case "price_desc":
      return list.sort((a, b) => b.price - a.price);
    default:
      return list;
  }
}
