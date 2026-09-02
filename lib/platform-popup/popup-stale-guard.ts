/**
 * CUT 2 — stale async winner acceptance gate (pure).
 */

import { isPlatformPopupAdvertisingSurface } from "@/lib/platform-popup/resolve-dibay-surface";
import {
  isPopupRuntimeEligible,
  type PopupRuntimeContext,
} from "@/lib/platform-popup/popup-runtime-context";

export type PlatformPopupStaleGuardInput = {
  requestGeneration: number;
  currentGeneration: number;
  surfaceAtRequest: string;
  winnerSurface: string;
  runtime: PopupRuntimeContext;
  chainLockSurface: string | null;
};

export function canAcceptPlatformPopupWinner(input: PlatformPopupStaleGuardInput): boolean {
  if (input.requestGeneration !== input.currentGeneration) return false;
  if (!isPopupRuntimeEligible(input.runtime)) return false;
  if (!isPlatformPopupAdvertisingSurface(input.runtime.surface)) return false;
  if (input.surfaceAtRequest !== input.runtime.surface) return false;
  if (input.winnerSurface !== input.runtime.surface) return false;
  if (input.chainLockSurface === input.runtime.surface) return false;
  return true;
}
