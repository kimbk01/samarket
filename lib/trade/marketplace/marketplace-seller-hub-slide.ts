/** `/market/sell` ↔ `/mypage/products` ↔ promotions — 우→좌 스택 깊이 SSOT */

function normalize(path: string | null | undefined): string {
  return String(path ?? "").split("?")[0]?.trim() ?? "";
}

export function isMarketplaceSellerHubPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (p === "/market/sell" || p.startsWith("/market/sell/")) return true;
  if (p === "/mypage/products" || p.startsWith("/mypage/products/")) return true;
  if (p === "/mypage/points/promotions" || p.startsWith("/mypage/points/promotions")) return true;
  return false;
}

/** -1 = not in seller hub stack */
export function marketplaceSellerHubDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (p === "/market/sell" || p.startsWith("/market/sell/")) return 0;
  if (p === "/mypage/products" || p.startsWith("/mypage/products/")) return 1;
  if (p === "/mypage/points/promotions" || p.startsWith("/mypage/points/promotions")) return 2;
  return -1;
}
