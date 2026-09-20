/**
 * Suppression UX mapping — CLOSE vs frequency suppress (Owner FINAL).
 * Engine modes remain CLOSE | SESSION | TODAY | DURATION | CAMPAIGN.
 *
 * Default UI: no suppress footer. X carries frequencyModeToDismissSuppressMode.
 */

import type { PlatformPopupPresentationSuppressionOption } from "@/lib/platform-popup/popup-presentation-types";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import { frequencyModeToDismissSuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export type PlatformPopupSuppressionUxMapping = {
  /** Plain visual close control exists; policy may upgrade to SESSION/TODAY/CAMPAIGN. */
  closeControlPrimary: true;
  /** User-facing suppress buttons — default empty (Owner chrome budget). */
  userFacingButtons: PlatformPopupPresentationSuppressionOption[];
  /** Mode written when primary dismiss fires. */
  dismissWrites: PlatformPopupSuppressionMode;
  todayCalendar: "Asia/Manila_local_day_end";
};

export function resolvePlatformPopupSuppressionUxMapping(input: {
  suppressionMode: PlatformPopupSuppressionMode | string;
  suppressionDurationSeconds?: number | null;
  frequencyMode?: string | null;
  allowExplicitSuppressChrome?: boolean;
}): PlatformPopupSuppressionUxMapping {
  return {
    closeControlPrimary: true,
    userFacingButtons: resolvePlatformPopupPresentationSuppressionOptions(input),
    dismissWrites: frequencyModeToDismissSuppressMode(input.frequencyMode),
    todayCalendar: "Asia/Manila_local_day_end",
  };
}
