/**
 * Derive renderer suppression UI options from campaign policy.
 *
 * OWNER FINAL (2026-09-20): DEFAULT chrome = floating X only.
 * Frequency policy executes on dismiss — no "don't show today" footer by default.
 *
 * Explicit suppress chrome is opt-in only (DURATION legacy / future Admin flag).
 * Do NOT surface TODAY/CAMPAIGN buttons when frequency_mode already owns suppress.
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
  /** Opt-in only — default interruptive presentations must leave this false/undefined. */
  allowExplicitSuppressChrome?: boolean;
}): PlatformPopupPresentationSuppressionOption[] {
  if (!input.allowExplicitSuppressChrome) {
    return [];
  }

  const modes = new Set<PlatformPopupPresentationSuppressionOption>();
  const frequency = normalizePlatformPopupFrequencyMode(input.frequencyMode);
  const policy = String(input.suppressionMode ?? "").trim().toUpperCase();
  const duration = input.suppressionDurationSeconds;

  // Explicit chrome only for DURATION snooze when Admin opted in.
  if (policy === "DURATION" && duration != null && duration > 0) {
    modes.add("DURATION");
  }

  // close_only + opt-in may still offer TODAY as a secondary control.
  if (frequency === "close_only" && policy === "TODAY") {
    modes.add("TODAY");
  }

  return [...modes];
}
