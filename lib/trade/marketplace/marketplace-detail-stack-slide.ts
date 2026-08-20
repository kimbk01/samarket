/** 거래 목록·탐색 → `/post/[id]` 상세 — 우→좌 스택 깊이 SSOT */

import { isMarketplaceSellerHubPath } from "@/lib/trade/marketplace/marketplace-seller-hub-slide";

function normalize(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

export function isTradePostDetailPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (!p.startsWith("/post/")) return false;
  const id = p.slice("/post/".length);
  return id.length > 0 && !id.includes("/");
}

/** 거래 글 상세로 들어올 수 있는 목록·탐색 surface */
export function isMarketplaceListSurfacePath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (!p || isTradePostDetailPath(p)) return false;
  if (isMarketplaceSellerHubPath(p)) return true;
  if (p === "/market" || p.startsWith("/market/")) return true;
  if (p === "/search" || p.startsWith("/search")) return true;
  if (p === "/favorites" || p.startsWith("/favorites")) return true;
  return false;
}

/** -1 = 스택 밖 · 0 = 목록 · 1 = 상세 */
export function marketplaceDetailStackDepth(path: string | null | undefined): number {
  if (isTradePostDetailPath(path)) return 1;
  if (isMarketplaceListSurfacePath(path)) return 0;
  return -1;
}
