/**
 * CUT 3 / CUT 1 reopen — normalized presentation payload for DibayPopupAd.
 */

import type {
  PlatformPopupConsumerSurface,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
} from "@/lib/platform-popup/types";
import type {
  PlatformPopupCreativeMode,
  PlatformPopupFrequencyMode,
  PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";

export type PlatformPopupPresentationCreative = {
  id: string;
  imageUrl: string;
  altText: string;
  aspectW: number;
  aspectH: number;
  creativeMode: PlatformPopupCreativeMode;
};

export type PlatformPopupPresentationCta = {
  type: PlatformPopupCtaType | string;
  href: string;
  label: string | null;
};

/** Suppression modes exposed in renderer UI (not CLOSE/SESSION — host/runtime). */
export type PlatformPopupPresentationSuppressionOption = Extract<
  PlatformPopupSuppressionMode,
  "TODAY" | "DURATION" | "CAMPAIGN"
>;

export type PlatformPopupPresentationWinner = {
  campaignId: string;
  creativeId: string;
  surface: PlatformPopupConsumerSurface | string;
  presentationType: PlatformPopupInterruptivePresentation;
  frequencyMode: PlatformPopupFrequencyMode;
  creative: PlatformPopupPresentationCreative;
  /** Optional title — omit empty containers when null. */
  title: string | null;
  /** Optional body/subcopy — omit empty containers when null. */
  body: string | null;
  /**
   * CUT 1 — Benefit Dialog hierarchy from linked Event benefit section only.
   * Required when presentationType === benefit_dialog. Never parsed from title/body.
   */
  benefit: { title: string; body: string | null } | null;
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  timezone: string;
  suppressionDurationSeconds: number | null;
};
