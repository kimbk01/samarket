/**
 * Platform Popup — central DIBAY surface resolver.
 * Pathname + context flags. CALL is not pathname-only.
 *
 * Advertising surfaces (selectable): COMMUNITY | TRADE | DELIVERY | DELIVERY_OWNER | ADMIN | MYPAGE
 * Critical ops are path/flag gates — not "ADMIN always excluded".
 */

import type { PlatformPopupResolvedSurface } from "@/lib/platform-popup/types";
import { PLATFORM_POPUP_CONSUMER_SURFACES } from "@/lib/platform-popup/types";
import { resolvePlatformPopupPathCriticalSurface } from "@/lib/platform-popup/popup-critical-path-gates";

export type ResolveDibaySurfaceContext = {
  callIncoming?: boolean;
  callActive?: boolean;
  nativeCallTransition?: boolean;
  paymentCritical?: boolean;
  orderSubmitCritical?: boolean;
  orderConfirmationCritical?: boolean;
  giftTransferCritical?: boolean;
  authRestoreCritical?: boolean;
  permissionOnboardingCritical?: boolean;
  addressGateCritical?: boolean;
  criticalDialogOpen?: boolean;
};

function normalizePath(pathname: string | null | undefined): string {
  const raw = (pathname ?? "").split("?")[0]!.trim();
  if (!raw) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

function hasCriticalUiBlock(ctx: ResolveDibaySurfaceContext | undefined): PlatformPopupResolvedSurface | null {
  if (!ctx) return null;
  if (ctx.callIncoming || ctx.callActive || ctx.nativeCallTransition) return "CALL";
  if (ctx.paymentCritical) return "PAYMENT";
  if (
    ctx.orderSubmitCritical ||
    ctx.orderConfirmationCritical ||
    ctx.giftTransferCritical
  ) {
    return "ORDER_CRITICAL";
  }
  if (
    ctx.authRestoreCritical ||
    ctx.permissionOnboardingCritical ||
    ctx.addressGateCritical ||
    ctx.criticalDialogOpen
  ) {
    return "ORDER_CRITICAL";
  }
  return null;
}

/**
 * Resolve canonical DIBAY surface for Platform Popup eligibility.
 */
export function resolveDibaySurface(
  pathname: string | null | undefined,
  context?: ResolveDibaySurfaceContext
): PlatformPopupResolvedSurface {
  const critical = hasCriticalUiBlock(context);
  if (critical) return critical;

  const pathCritical = resolvePlatformPopupPathCriticalSurface(pathname);
  if (pathCritical) return pathCritical;

  const p = normalizePath(pathname);

  if (p === "/admin" || p.startsWith("/admin/")) return "ADMIN";

  if (
    p === "/community-messenger" ||
    p.startsWith("/community-messenger/") ||
    p === "/chats" ||
    p.startsWith("/chats/") ||
    p.startsWith("/mypage/trade/chat")
  ) {
    return "MESSENGER";
  }

  if (
    p === "/stores/owner" ||
    p.startsWith("/stores/owner/") ||
    /^\/stores\/[^/]+\/owner(\/|$)/.test(p) ||
    p === "/my/business" ||
    p.startsWith("/my/business/")
  ) {
    return "DELIVERY_OWNER";
  }

  // Payment / order-critical pathnames (consumer)
  if (
    p === "/stores/cart" ||
    p.startsWith("/stores/cart/") ||
    /\/order\/complete(\/|$)/.test(p) ||
    p.startsWith("/orders/store/") ||
    p.startsWith("/mypage/store-orders/") ||
    p.startsWith("/my/store-orders/")
  ) {
    if (p.includes("/chat")) return "MESSENGER";
    return "ORDER_CRITICAL";
  }

  if (p === "/philife" || p.startsWith("/philife/") || p === "/community" || p.startsWith("/community/")) {
    return "COMMUNITY";
  }

  if (
    p === "/market" ||
    p.startsWith("/market/") ||
    p === "/dibamarket" ||
    p.startsWith("/dibamarket/") ||
    p === "/post" ||
    p.startsWith("/post/") ||
    p === "/write" ||
    p.startsWith("/write/")
  ) {
    return "TRADE";
  }

  if (
    p === "/stores" ||
    p.startsWith("/stores/") ||
    p === "/delivery" ||
    p.startsWith("/delivery/") ||
    p === "/shop" ||
    p.startsWith("/shop/")
  ) {
    return "DELIVERY";
  }

  if (p === "/mypage" || p.startsWith("/mypage/") || p === "/my" || p.startsWith("/my/")) {
    return "MYPAGE";
  }

  return "UNKNOWN";
}

export function isPlatformPopupAdvertisingSurface(
  surface: PlatformPopupResolvedSurface
): surface is (typeof PLATFORM_POPUP_CONSUMER_SURFACES)[number] {
  return (PLATFORM_POPUP_CONSUMER_SURFACES as readonly string[]).includes(surface);
}

/** Compat: legacy OWNER_OPS label → DELIVERY_OWNER for matching. */
export function normalizePlatformPopupResolvedSurface(
  surface: string
): PlatformPopupResolvedSurface {
  const s = String(surface ?? "").trim().toUpperCase();
  if (s === "OWNER_OPS") return "DELIVERY_OWNER";
  return s as PlatformPopupResolvedSurface;
}
