/**
 * CUT 2 — optional critical-UI flags for states owned as local React UI elsewhere.
 * Pathname/call/support already cover most gates; pages may push payment/gift/address.
 */

export type PlatformPopupCriticalRuntimeFlags = {
  paymentCritical: boolean;
  orderSubmitCritical: boolean;
  orderConfirmationCritical: boolean;
  giftTransferCritical: boolean;
  authRestoreGate: boolean;
  permissionGate: boolean;
  addressGate: boolean;
  criticalDialog: boolean;
};

const DEFAULT: PlatformPopupCriticalRuntimeFlags = {
  paymentCritical: false,
  orderSubmitCritical: false,
  orderConfirmationCritical: false,
  giftTransferCritical: false,
  authRestoreGate: false,
  permissionGate: false,
  addressGate: false,
  criticalDialog: false,
};

let flags: PlatformPopupCriticalRuntimeFlags = { ...DEFAULT };
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function getPlatformPopupCriticalRuntimeFlags(): PlatformPopupCriticalRuntimeFlags {
  return flags;
}

export function subscribePlatformPopupCriticalRuntimeFlags(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => listeners.delete(onStore);
}

export function patchPlatformPopupCriticalRuntimeFlags(
  patch: Partial<PlatformPopupCriticalRuntimeFlags>
): void {
  flags = { ...flags, ...patch };
  notify();
}

export function resetPlatformPopupCriticalRuntimeFlagsForTests(): void {
  flags = { ...DEFAULT };
  notify();
}
