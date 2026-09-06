/**
 * Owner stack back-parent SSOT — prefer list/detail parent over hub when nested.
 */

import { OwnerRoutes } from "@/lib/business/owner-routes";

function normalizeOwnerPath(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") || "";
}

/**
 * Resolve back href for Owner chrome (non-hub). Returns undefined for hub.
 */
export function resolveOwnerStackBackHref(pathname: string, storeId: string): string | undefined {
  const sid = storeId.trim();
  if (!sid) return undefined;
  const p = normalizeOwnerPath(pathname);
  if (p === "/stores/owner" || p === "/my/business") return undefined;

  if (p.startsWith("/stores/owner/customer-care/messages/") || p.startsWith("/stores/owner/customer-care/inquiries/")) {
    const tab = p.includes("/messages/") ? "messages" : "inquiries";
    return OwnerRoutes.customerCareCenter(sid, tab);
  }
  if (
    p === "/stores/owner/customer-care/customer-center" ||
    p.startsWith("/stores/owner/customer-care/messages") ||
    p.startsWith("/stores/owner/customer-care/inquiries")
  ) {
    return OwnerRoutes.customerCare(sid);
  }
  if (p === "/stores/owner/customer-care") {
    return OwnerRoutes.hub(sid);
  }

  if (p === "/stores/owner/products/new" || /\/stores\/owner\/products\/[^/]+\/edit$/.test(p)) {
    return OwnerRoutes.products(sid);
  }
  if (p.startsWith("/stores/owner/ads/new/") || p.startsWith("/stores/owner/ads/popup/")) {
    return OwnerRoutes.ads(sid);
  }
  if (/\/stores\/owner\/ads\/[^/]+$/.test(p) && p !== "/stores/owner/ads") {
    return OwnerRoutes.ads(sid);
  }
  if (p === "/stores/owner/ads/partner") {
    return OwnerRoutes.ads(sid);
  }

  if (p === "/stores/owner/settlements" || p === "/stores/owner/business-cash" || p === "/stores/owner/points") {
    return OwnerRoutes.finance(sid);
  }

  if (p === "/stores/owner/notification-settings") {
    return OwnerRoutes.notifications(sid);
  }

  if (p === "/stores/owner/order-chats") {
    return OwnerRoutes.orders(sid);
  }

  if (p === "/stores/owner/menu-categories") {
    return OwnerRoutes.products(sid);
  }

  // Default nested → hub
  return OwnerRoutes.hub(sid);
}
