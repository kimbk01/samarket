/**
 * Customer commerce child-flow stack depth — hub → gift mall → product / owned instance.
 * Forward → rtl-forward · back → ltr-back. Tab switches on `/orders/activity` stay subtle (same path).
 */

function normalize(path: string | null | undefined): string {
  const raw = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "") || "/";
}

export function isCommerceConsumerStackPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (p === "/orders/activity" || p === "/orders") return true;
  if (p === "/stores/gift-mall" || p.startsWith("/stores/gift-mall/")) return true;
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return true;
  return false;
}

/**
 * -1 = outside commerce consumer child stack
 *  0 = hub root `/orders/activity`
 *  1 = gift mall list
 *  2 = gift product detail or owned instance detail
 */
export function commerceConsumerStackDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (!isCommerceConsumerStackPath(p)) return -1;
  if (p === "/orders/activity" || p === "/orders") return 0;
  if (p === "/stores/gift-mall") return 1;
  if (p.startsWith("/stores/gift-mall/")) return 2;
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return 2;
  return -1;
}
