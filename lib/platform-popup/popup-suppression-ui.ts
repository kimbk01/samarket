/**
 * Derive renderer suppression UI options from campaign policy.
 * Do NOT always offer TODAY — frequency/suppression policy decides.
 */

import type { PlatformPopupPresentationSuppressionOption } from "@/lib/platform-popup/popup-presentation-types";
import {
  normalizePlatformPopupFrequencyMode,
  type PlatformPopupFrequencyMode,
} from "@/lib/platform-popup/presentation-contract";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export function resolvePlatformPopupPresentationSuppressionOptions(input: {
  suppressionMode: PlatformPopupSuppressionMode | string;
  suppressionDurationSeconds?: number | null;
  frequencyMode?: PlatformPopupFrequencyMode | string | null;
}): PlatformPopupPresentationSuppressionOption[] {
  const modes = new Set<PlatformPopupPresentationSuppressionOption>();
  const frequency = normalizePlatformPopupFrequencyMode(input.frequencyMode);
  const policy = String(input.suppressionMode ?? "").trim().toUpperCase();
  const duration = input.suppressionDurationSeconds;

  if (policy === "TODAY") modes.add("TODAY");
  if (policy === "CAMPAIGN") modes.add("CAMPAIGN");
  if (policy === "DURATION" && duration != null && duration > 0) {
    modes.add("DURATION");
  }

  // Legacy close_only: keep optional "don't show today" when Admin left TODAY policy.
  if (frequency === "close_only" && policy !== "CAMPAIGN" && policy !== "DURATION") {
    modes.add("TODAY");
  }

  return [...modes];
}
