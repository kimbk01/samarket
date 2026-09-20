/**
 * CUT 3 / CUT 1 reopen — map resolver winner + candidate → presentation payload.
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
import {
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
} from "@/lib/platform-popup/presentation-contract";
import {
  assertBenefitDialogContent,
  type PlatformPopupEventBenefitContent,
} from "@/lib/platform-popup/event-benefit-authority";

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
    title?: string | null;
    body?: string | null;
    frequencyMode?: string | null;
  },
  /** Event benefit section when presentation is benefit_dialog. */
  eventBenefit: PlatformPopupEventBenefitContent | null = null
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

  const frequencyMode = normalizePlatformPopupFrequencyMode(
    campaignRow.frequencyMode ?? winner.frequencyMode
  );
  const creativeMode = normalizePlatformPopupCreativeMode(
    candidate.creative?.creativeMode ?? winner.creativeMode
  );

  const benefitGate = assertBenefitDialogContent(winner.presentationType, eventBenefit);
  if (!benefitGate.ok) return null;

  return {
    campaignId: winner.campaignId,
    creativeId: winner.creativeId,
    surface: winner.surface,
    presentationType: winner.presentationType,
    frequencyMode,
    creative: {
      id: winner.creativeId,
      imageUrl,
      altText: String(creativeRow.altText ?? "").trim() || "Advertisement",
      aspectW: candidate.creative?.aspectW ?? 36,
      aspectH: candidate.creative?.aspectH ?? 25,
      creativeMode,
    },
    title: campaignRow.title?.trim() || candidate.title?.trim() || null,
    body: campaignRow.body?.trim() || candidate.body?.trim() || null,
    benefit: benefitGate.required
      ? { title: benefitGate.benefit.title, body: benefitGate.benefit.body }
      : null,
    cta: {
      type: cta.value.ctaType,
      href: cta.value.href,
      label: campaignRow.ctaLabel?.trim() || candidate.ctaLabel?.trim() || null,
    },
    suppressionOptions: resolvePlatformPopupPresentationSuppressionOptions({
      suppressionMode: campaignRow.suppressionMode ?? "TODAY",
      suppressionDurationSeconds: campaignRow.suppressionDurationSeconds,
      frequencyMode,
    }),
    timezone: campaignRow.timezone?.trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE,
    suppressionDurationSeconds:
      campaignRow.suppressionDurationSeconds != null &&
      campaignRow.suppressionDurationSeconds > 0
        ? campaignRow.suppressionDurationSeconds
        : null,
  };
}
