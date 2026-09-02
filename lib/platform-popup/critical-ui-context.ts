/**
 * Platform Popup CUT 1 — critical UI deferral contract boundary.
 * Do not solve with z-index. Reuse existing runtime sources; do not invent stores.
 *
 * Known readers (integration later / host CUT):
 * - Call: lib/community-messenger/call-v4/call-v4-store.ts, lib/call/active-call-session.ts
 * - Payment/order: StoreCommerceCartPageClient checkoutConfirmOpen (local)
 * - Gift: CommunityMessengerRoomPhase2RoomSheets giftOfferOpen (local)
 * - Address: MandatoryAddressGate / mandatory-address-gate-client
 * - Permission: dibay-device-permission-onboarding
 */

import type { ResolveDibaySurfaceContext } from "@/lib/platform-popup/resolve-dibay-surface";

export type PlatformPopupCriticalUiSnapshot = {
  callIncoming: boolean;
  callActive: boolean;
  nativeCallTransition: boolean;
  paymentCritical: boolean;
  orderSubmitCritical: boolean;
  orderConfirmationCritical: boolean;
  giftTransferCritical: boolean;
  authRestoreCritical: boolean;
  permissionOnboardingCritical: boolean;
  addressGateCritical: boolean;
  criticalDialogOpen: boolean;
};

export const PLATFORM_POPUP_CRITICAL_UI_DEFAULTS: PlatformPopupCriticalUiSnapshot = {
  callIncoming: false,
  callActive: false,
  nativeCallTransition: false,
  paymentCritical: false,
  orderSubmitCritical: false,
  orderConfirmationCritical: false,
  giftTransferCritical: false,
  authRestoreCritical: false,
  permissionOnboardingCritical: false,
  addressGateCritical: false,
  criticalDialogOpen: false,
};

export function toResolveDibaySurfaceContext(
  snapshot: Partial<PlatformPopupCriticalUiSnapshot> | null | undefined
): ResolveDibaySurfaceContext {
  const s = { ...PLATFORM_POPUP_CRITICAL_UI_DEFAULTS, ...snapshot };
  return {
    callIncoming: s.callIncoming,
    callActive: s.callActive,
    nativeCallTransition: s.nativeCallTransition,
    paymentCritical: s.paymentCritical,
    orderSubmitCritical: s.orderSubmitCritical,
    orderConfirmationCritical: s.orderConfirmationCritical,
    giftTransferCritical: s.giftTransferCritical,
    authRestoreCritical: s.authRestoreCritical,
    permissionOnboardingCritical: s.permissionOnboardingCritical,
    addressGateCritical: s.addressGateCritical,
    criticalDialogOpen: s.criticalDialogOpen,
  };
}

export type PlatformPopupDeferralReason =
  | "call_incoming"
  | "call_active"
  | "native_call_transition"
  | "payment"
  | "order_submit"
  | "order_confirmation"
  | "gift_transfer"
  | "auth_restore"
  | "permission_onboarding"
  | "address_gate"
  | "critical_dialog"
  | null;

export function resolvePlatformPopupDeferralReason(
  snapshot: Partial<PlatformPopupCriticalUiSnapshot> | null | undefined
): PlatformPopupDeferralReason {
  const s = { ...PLATFORM_POPUP_CRITICAL_UI_DEFAULTS, ...snapshot };
  if (s.callIncoming) return "call_incoming";
  if (s.callActive) return "call_active";
  if (s.nativeCallTransition) return "native_call_transition";
  if (s.paymentCritical) return "payment";
  if (s.orderSubmitCritical) return "order_submit";
  if (s.orderConfirmationCritical) return "order_confirmation";
  if (s.giftTransferCritical) return "gift_transfer";
  if (s.authRestoreCritical) return "auth_restore";
  if (s.permissionOnboardingCritical) return "permission_onboarding";
  if (s.addressGateCritical) return "address_gate";
  if (s.criticalDialogOpen) return "critical_dialog";
  return null;
}

export function isPlatformPopupDeferredByCriticalUi(
  snapshot: Partial<PlatformPopupCriticalUiSnapshot> | null | undefined
): boolean {
  return resolvePlatformPopupDeferralReason(snapshot) != null;
}
