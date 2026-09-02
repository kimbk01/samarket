/**
 * CUT 3 — normalized presentation payload for DibayPopupAd (not raw DB rows).
 */

import type {
  PlatformPopupConsumerSurface,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
} from "@/lib/platform-popup/types";

export type PlatformPopupPresentationCreative = {
  id: string;
  imageUrl: string;
  altText: string;
  aspectW: number;
  aspectH: number;
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
  creative: PlatformPopupPresentationCreative;
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  timezone: string;
  suppressionDurationSeconds: number | null;
};
