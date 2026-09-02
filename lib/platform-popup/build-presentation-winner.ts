/**
 * CUT 3 — map resolver winner + candidate row → presentation payload.
 */

import { resolvePlatformPopupCreativePublicUrl } from "@/lib/platform-popup/resolve-popup-creative-url";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import type {
  PlatformPopupCandidate,
  ResolvePopupAdWinner,
} from "@/lib/platform-popup/resolve-popup-ad";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";

export function buildPlatformPopupPresentationWinner(
  winner: ResolvePopupAdWinner,
  candidate: PlatformPopupCandidate,
  creativeRow: {
    assetUrl?: string | null;
    assetPath?: string | null;
    altText?: string | null;
  },
  campaignRow: {
    suppressionMode?: string | null;
    suppressionDurationSeconds?: number | null;
    timezone?: string | null;
    ctaLabel?: string | null;
  }
): PlatformPopupPresentationWinner | null {
  const imageUrl = resolvePlatformPopupCreativePublicUrl({
    assetUrl: creativeRow.assetUrl,
    assetPath: creativeRow.assetPath,
  });
  if (!imageUrl) return null;

  const cta = validatePlatformPopupCta(
    {
      ctaType: candidate.ctaType,
      ctaTarget: candidate.ctaTarget,
      externalUrl: candidate.externalUrl,
    },
    candidate.ctaLookup
  );
  if (!cta.ok) return null;

  return {
    campaignId: winner.campaignId,
    creativeId: winner.creativeId,
    surface: winner.surface,
    creative: {
      id: winner.creativeId,
      imageUrl,
      altText: String(creativeRow.altText ?? "").trim() || "Advertisement",
      aspectW: candidate.creative?.aspectW ?? 36,
      aspectH: candidate.creative?.aspectH ?? 25,
    },
    cta: {
      type: cta.value.ctaType,
      href: cta.value.href,
      label: campaignRow.ctaLabel?.trim() || null,
    },
    suppressionOptions: resolvePlatformPopupPresentationSuppressionOptions({
      suppressionMode: campaignRow.suppressionMode ?? "TODAY",
      suppressionDurationSeconds: campaignRow.suppressionDurationSeconds,
    }),
    timezone: campaignRow.timezone?.trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE,
    suppressionDurationSeconds:
      campaignRow.suppressionDurationSeconds != null &&
      campaignRow.suppressionDurationSeconds > 0
        ? campaignRow.suppressionDurationSeconds
        : null,
  };
}
