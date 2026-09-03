/**
 * Suppression UX mapping — CLOSE != SESSION (product contract).
 * Engine modes remain CLOSE | SESSION | TODAY | DURATION | CAMPAIGN.
 */

import type { PlatformPopupPresentationSuppressionOption } from "@/lib/platform-popup/popup-presentation-types";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export type PlatformPopupSuppressionUxMapping = {
  /** Plain dismiss — ends current exposure only; does NOT persist SESSION. */
  closePersists: false;
  closeEqualsSession: false;
  /** User-facing suppress buttons derived from campaign policy. */
  userFacingButtons: PlatformPopupPresentationSuppressionOption[];
  todayCalendar: "Asia/Manila_local_day_end";
};

export function resolvePlatformPopupSuppressionUxMapping(input: {
  suppressionMode: PlatformPopupSuppressionMode | string;
  suppressionDurationSeconds?: number | null;
}): PlatformPopupSuppressionUxMapping {
  return {
    closePersists: false,
    closeEqualsSession: false,
    userFacingButtons: resolvePlatformPopupPresentationSuppressionOptions(input),
    todayCalendar: "Asia/Manila_local_day_end",
  };
}
