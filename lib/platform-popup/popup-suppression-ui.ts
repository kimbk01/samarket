/**
 * CUT 3 — derive renderer suppression UI options from campaign policy.
 */

import type { PlatformPopupPresentationSuppressionOption } from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export function resolvePlatformPopupPresentationSuppressionOptions(input: {
  suppressionMode: PlatformPopupSuppressionMode | string;
  suppressionDurationSeconds?: number | null;
}): PlatformPopupPresentationSuppressionOption[] {
  const modes = new Set<PlatformPopupPresentationSuppressionOption>();

  // TODAY — default offered (product CUT 0-C)
  modes.add("TODAY");

  const duration = input.suppressionDurationSeconds;
  if (duration != null && duration > 0) {
    modes.add("DURATION");
  }

  const policy = String(input.suppressionMode ?? "").trim().toUpperCase();
  if (policy === "CAMPAIGN") {
    modes.add("CAMPAIGN");
  }
  if (policy === "DURATION" && duration != null && duration > 0) {
    modes.add("DURATION");
  }

  return [...modes];
}
