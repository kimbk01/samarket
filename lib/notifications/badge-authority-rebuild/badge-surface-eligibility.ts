/**
 * Slice 2-1 — Surface eligibility by authority.
 */

import type { BadgeAuthority, BadgeSurface } from "./badge-authority-types";

const A_SURFACES: ReadonlySet<BadgeSurface> = new Set([
  "MEMBER_BELL",
  "MEMBER_NOTIFICATION_INBOX",
  "MEMBER_APP_ICON",
]);

const B_MEMBER_SURFACES: ReadonlySet<BadgeSurface> = new Set([
  "MEMBER_CHAT_ROW",
  "BOTTOM_CHAT",
  "TRADE_HUB",
  "CUSTOMER_ORDER_HUB",
  "MEMBER_APP_ICON",
  "MEMBER_MISSED_CALL",
  "NATIVE_MEMBER_APP_ICON",
]);

const B_STORE_SURFACES: ReadonlySet<BadgeSurface> = new Set([
  "OWNER_STORE_ORDER_ROW",
  "OWNER_CHAT_SURFACE",
  "STORE_MISSED_CALL",
]);

const C_STORE_SURFACES: ReadonlySet<BadgeSurface> = new Set([
  "OWNER_OPERATION_BADGE",
  "OWNER_DELIVERY_BOTTOM",
  "OWNER_ADMIN_OPERATION",
  // Product Bible: O_bell + App Icon ∪
  "MEMBER_BELL",
  "MEMBER_APP_ICON",
  "NATIVE_MEMBER_APP_ICON",
]);

export function resolveBadgeProjectionEligibility(
  authority: BadgeAuthority
): ReadonlySet<BadgeSurface> {
  switch (authority) {
    case "A_MEMBER_NOTIFICATION":
      return A_SURFACES;
    case "B_MEMBER_COMMUNICATION":
      return B_MEMBER_SURFACES;
    case "B_STORE_COMMUNICATION":
      return B_STORE_SURFACES;
    case "C_STORE_OPERATION":
      return C_STORE_SURFACES;
  }
}

export function authorityAllowsSurface(
  authority: BadgeAuthority,
  surface: BadgeSurface
): boolean {
  return resolveBadgeProjectionEligibility(authority).has(surface);
}
