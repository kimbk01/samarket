/**
 * Customer commerce child-flow stack depth — hub/store → product/cart/checkout/order.
 * Forward → rtl-forward · back → ltr-back. Tab switches on `/orders/activity` stay subtle (same path).
 */

function normalize(path: string | null | undefined): string {
  const raw = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "") || "/";
}

const STORES_STATIC_SEGMENTS = new Set([
  "browse",
  "cart",
  "gift-mall",
  "owner",
  "search",
]);

function storeSlugSegments(path: string): string[] | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "stores" || !parts[1] || STORES_STATIC_SEGMENTS.has(parts[1])) return null;
  return parts.slice(1);
}

export function commerceConsumerChildHostKey(path: string | null | undefined): string {
  const p = normalize(path);
  const storeSegs = storeSlugSegments(p);
  if (storeSegs?.[0]) return `store:${storeSegs[0]}`;
  if (p === "/stores/gift-mall" || p.startsWith("/stores/gift-mall/")) return "gift-mall";
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return "gift-wallet";
  if (/^\/orders\/store\/[^/]+\/chat$/.test(p)) return "order-chat";
  return p;
}

export function isCommerceConsumerStackPath(path: string | null | undefined): boolean {
  const p = normalize(path);
  if (p === "/orders/activity" || p === "/orders") return true;
  if (p === "/stores/gift-mall" || p.startsWith("/stores/gift-mall/")) return true;
  if (storeSlugSegments(p)) return true;
  if (/^\/orders\/store\/[^/]+\/chat$/.test(p)) return true;
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return true;
  return false;
}

/**
 * -1 = outside commerce consumer child stack
 *  0 = hub root `/orders/activity`, `/orders`, or store root
 *  1 = gift mall list or store product detail
 *  2 = cart
 *  3 = checkout
 *  4 = committed order chat entry
 */
export function commerceConsumerStackDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (!isCommerceConsumerStackPath(p)) return -1;
  if (p === "/orders/activity" || p === "/orders") return 0;
  const storeSegs = storeSlugSegments(p);
  if (storeSegs) {
    if (storeSegs.length === 1) return 0;
    if (storeSegs[1] === "p" && storeSegs[2]) return 1;
    if (storeSegs[1] === "cart") return 2;
    if (storeSegs[1] === "checkout") return 3;
    if (storeSegs[1] === "order" && storeSegs[2]) return 2;
  }
  if (/^\/orders\/store\/[^/]+\/chat$/.test(p)) return 4;
  if (p === "/stores/gift-mall") return 1;
  if (p.startsWith("/stores/gift-mall/")) return 2;
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return 2;
  return -1;
}
