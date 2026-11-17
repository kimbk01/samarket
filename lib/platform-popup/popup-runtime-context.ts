/**
 * CUT 2 — canonical PopupRuntimeContext SSOT.
 */

import type { PlatformPopupResolvedSurface } from "@/lib/platform-popup/types";

/**
 * 진입 감사 PO-4 (2026-11-17 · Owner 「설계안대로 진행」): 가로 화면(태블릿 가로·데스크톱)에서도 팝업을 보인다.
 * 폭은 태블릿 최대 폭 토큰(480px)으로 제한된다. 예전에는 `matchMedia(orientation: landscape)` 하나로 모든 가로 화면을
 * 막아, 계약(태블릿 가로만 보류)보다 넓게 차단했고 샤오미 태블릿 가로에서는 어드민 팝업이 하나도 나오지 않았다.
 * 어드민 전체 스위치(4단계)가 생기면 그 값이 `allowLandscape` 로 들어온다.
 */
export const PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT = true;

/**
 * 빌드 전 감사 P5 / PO-4 (2026-11-17): 가로 허용은 태블릿만 — 화면 짧은 변이 이 값보다 작으면(휴대폰) 정책과 상관없이
 * 가로에서 보류한다. 이 값 이상(태블릿·데스크톱)이면 어드민 「가로 화면에서도 보이기」를 따른다.
 */
export const PLATFORM_POPUP_LANDSCAPE_TABLET_MIN_SHORT_SIDE_PX = 600;

/** 가로 화면에서 팝업을 보류하는가 (세로면 false) */
export function isPlatformPopupLandscapeBlocked(input: {
  isLandscape: boolean;
  allowLandscape?: boolean;
  viewportShortSide?: number | null;
}): boolean {
  if (!input.isLandscape) return false;
  const short = input.viewportShortSide;
  if (typeof short === "number" && Number.isFinite(short) && short > 0 && short < PLATFORM_POPUP_LANDSCAPE_TABLET_MIN_SHORT_SIDE_PX) {
    return true;
  }
  return !(input.allowLandscape ?? PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT);
}

export type PopupRuntimeContext = {
  pathname: string;
  surface: PlatformPopupResolvedSurface;

  authReady: boolean;
  userId: string | null;

  isAppForeground: boolean;
  isLandscape: boolean;
  /** 가로 화면 표시 허용 — 없으면 `PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT` */
  allowLandscape?: boolean;
  /** 화면 짧은 변(CSS px) — 600 미만(휴대폰)이면 가로에서 늘 보류 (P5). 없으면 정책만 본다 */
  viewportShortSide?: number | null;

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
  if (isPlatformPopupLandscapeBlocked(ctx)) return "landscape";
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
