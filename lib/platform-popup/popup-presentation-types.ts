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
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  timezone: string;
  suppressionDurationSeconds: number | null;
};
