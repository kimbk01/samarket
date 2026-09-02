/**
 * Platform Popup CUT 1 — central DIBAY surface resolver.
 * Pathname + context flags. CALL is not pathname-only.
 */

import type { PlatformPopupResolvedSurface } from "@/lib/platform-popup/types";

export type ResolveDibaySurfaceContext = {
  /** Call V4 / native: incoming ring or active session. */
  callIncoming?: boolean;
  callActive?: boolean;
  nativeCallTransition?: boolean;
  /** Checkout / order submit / confirmation in progress. */
  paymentCritical?: boolean;
  orderSubmitCritical?: boolean;
  orderConfirmationCritical?: boolean;
  giftTransferCritical?: boolean;
  /** Auth restore / permission onboarding / address gate / critical dialog. */
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
  // Auth / permission / address / dialog: treat as ORDER_CRITICAL exclusion bucket for ads
  // (default excluded set includes these under critical deferral — map to ORDER_CRITICAL).
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
 * Excluded surfaces never receive popup ads in v1.
 */
export function resolveDibaySurface(
  pathname: string | null | undefined,
  context?: ResolveDibaySurfaceContext
): PlatformPopupResolvedSurface {
  const critical = hasCriticalUiBlock(context);
  if (critical) return critical;

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
    return "OWNER_OPS";
  }

  // Payment / order-critical pathnames (even without context flags)
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
): surface is "COMMUNITY" | "TRADE" | "DELIVERY" | "MYPAGE" {
  return (
    surface === "COMMUNITY" ||
    surface === "TRADE" ||
    surface === "DELIVERY" ||
    surface === "MYPAGE"
  );
}
