/**
 * CUT-C — Delivery consumer drill-down stack depth SSOT.
 * Forward (deeper) → main-shell `rtl-forward` · back (shallower) → `ltr-back`.
 * Owner / apply stacks are out of scope (−1).
 */

import { isStoresOwnerStackPath } from "@/lib/business/owner-stack-path";

function normalize(path: string | null | undefined): string {
  const raw = String(path ?? "").split("?")[0]?.trim() ?? "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "") || "/";
}

function isStoreOwnerApplyPath(path: string): boolean {
  return path === "/stores/owner/apply" || path.startsWith("/stores/owner/apply/");
}

/** Reserved first segments under `/stores/` that are not a public store slug. */
const STORES_RESERVED_ROOT = new Set([
  "browse",
  "search",
  "cart",
  "owner",
  "orders",
  "checkout",
  "write",
  "new",
  "gift-mall",
]);

/**
 * -1 = outside delivery consumer stack
 *  0 = `/stores` hub
 *  1 = browse / search
 *  2 = store detail root, hub cart, hub orders
 *  3+= deeper under a store slug (menu/cart/checkout/…)
 */
export function deliveryConsumerStackDepth(path: string | null | undefined): number {
  const p = normalize(path);
  if (!p.startsWith("/stores")) return -1;
  if (isStoresOwnerStackPath(p) || isStoreOwnerApplyPath(p)) return -1;
  if (p === "/stores") return 0;

  const rest = p.slice("/stores".length).replace(/^\//, "");
  if (!rest) return 0;
  const parts = rest.split("/").filter(Boolean);
  const head = parts[0] ?? "";

  if (head === "browse") return 1;
  if (head === "search") return 1;
  if (head === "cart" || head === "orders" || head === "checkout") return 2;
  if (STORES_RESERVED_ROOT.has(head)) return -1;

  /** `/stores/:slug` … */
  if (parts.length === 1) return 2;
  return 2 + (parts.length - 1);
}

export function isDeliveryConsumerStackPath(path: string | null | undefined): boolean {
  return deliveryConsumerStackDepth(path) >= 0;
}
