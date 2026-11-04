/**
 * CUT 2 — canonical PopupRuntimeContext SSOT.
 */

import type { PlatformPopupResolvedSurface } from "@/lib/platform-popup/types";

export type PopupRuntimeContext = {
  pathname: string;
  surface: PlatformPopupResolvedSurface;

  authReady: boolean;
  userId: string | null;

  isAppForeground: boolean;
  isLandscape: boolean;

  incomingCall: boolean;
  activeCall: boolean;
  nativeCallTransition: boolean;

  paymentCritical: boolean;
  orderSubmitCritical: boolean;
  orderConfirmationCritical: boolean;
  giftTransferCritical: boolean;

  authRestoreGate: boolean;
  permissionGate: boolean;
  addressGate: boolean;
  criticalDialog: boolean;

  startupDeferred: boolean;
  storesLcpDeferred: boolean;

  /** CX-01: 시작 화면(인트로)이 아직 끝나지 않음(phase ≠ done) — 끝날 때까지 판정 보류 */
  launchIntroActive: boolean;
  /** CX-05: PTR 새로고침 진행 중(새로고침·결과 표시) — 끝날 때까지 판정 보류 */
  ptrRefreshing: boolean;

  appSessionId: string;
};

export type PopupRuntimeGateBlockReason =
  | "surface_excluded"
  | "auth_not_ready"
  | "background"
  | "landscape"
  | "call"
  | "payment_order_gift"
  | "auth_permission_address_dialog"
  | "startup"
  | "stores_lcp"
  | "launch_intro"
  | "ptr_refreshing"
  | null;

export function resolvePopupRuntimeBlockReason(
  ctx: PopupRuntimeContext
): PopupRuntimeGateBlockReason {
  if (!ctx.authReady || ctx.authRestoreGate) return "auth_not_ready";
  if (ctx.startupDeferred) return "startup";
  if (ctx.launchIntroActive) return "launch_intro";
  if (!ctx.isAppForeground) return "background";
  if (ctx.isLandscape) return "landscape";
  if (ctx.incomingCall || ctx.activeCall || ctx.nativeCallTransition) return "call";
  if (
    ctx.paymentCritical ||
    ctx.orderSubmitCritical ||
    ctx.orderConfirmationCritical ||
    ctx.giftTransferCritical
  ) {
    return "payment_order_gift";
  }
  if (ctx.permissionGate || ctx.addressGate || ctx.criticalDialog) {
    return "auth_permission_address_dialog";
  }
  if (ctx.storesLcpDeferred) return "stores_lcp";
  if (ctx.ptrRefreshing) return "ptr_refreshing";
  if (
    ctx.surface === "MESSENGER" ||
    ctx.surface === "CALL" ||
    ctx.surface === "PAYMENT" ||
    ctx.surface === "ORDER_CRITICAL" ||
    ctx.surface === "UNKNOWN" ||
    ctx.surface === "OWNER_OPS"
  ) {
    return "surface_excluded";
  }
  return null;
}

export function isPopupRuntimeEligible(ctx: PopupRuntimeContext): boolean {
  return resolvePopupRuntimeBlockReason(ctx) == null;
}
