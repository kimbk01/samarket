/**
 * Platform Popup CUT 1 — canonical eligibility resolver boundary.
 * Returns exactly 0 or 1 deterministic winner. Rotation via lastImpressionAt.
 */

import {
  isPlatformPopupStatusScheduleEligible,
  isPlatformPopupWithinScheduleWindow,
} from "@/lib/platform-popup/campaign-lifecycle";
import {
  isPlatformPopupDeferredByCriticalUi,
  toResolveDibaySurfaceContext,
  type PlatformPopupCriticalUiSnapshot,
} from "@/lib/platform-popup/critical-ui-context";
import {
  validatePlatformPopupCta,
  type PlatformPopupCtaTargetLookup,
} from "@/lib/platform-popup/cta";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import {
  isPlatformPopupSuppressionActive,
  type PlatformPopupSuppressionRecord,
} from "@/lib/platform-popup/suppression";
import { platformPopupSurfaceMatches } from "@/lib/platform-popup/surfaces";
import { comparePopupCandidatesForRotation } from "@/lib/platform-popup/popup-rotation";
import {
  isPlatformPopupInterruptivePresentation,
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
  normalizePlatformPopupPresentationType,
  type PlatformPopupCreativeMode,
  type PlatformPopupFrequencyMode,
  type PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import { isPlatformPopupCreativeAspectValid } from "@/lib/platform-popup/creative-contract";
import { isPopupCandidateCoordinatedAway } from "@/lib/platform-promotion-lifecycle/content-visit-eligibility";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupConsumerSurface,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export type PlatformPopupCandidate = {
  id: string;
  status: PlatformPopupCampaignStatus;
  approvalStatus: PlatformPopupApprovalStatus;
  priority: number;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  timezone?: string | null;
  surfaces: readonly PlatformPopupTargetSurface[];
  presentationType?: string | null;
  frequencyMode?: string | null;
  creative: {
    id: string;
    status: "draft" | "ready" | "rejected";
    aspectW: number;
    aspectH: number;
    creativeMode?: PlatformPopupCreativeMode | string | null;
    assetPath?: string | null;
    assetUrl?: string | null;
    altText?: string | null;
  } | null;
  ctaType: PlatformPopupCtaType | string;
  ctaTarget?: string | null;
  externalUrl?: string | null;
  ctaLabel?: string | null;
  title?: string | null;
  body?: string | null;
  suppressionMode?: PlatformPopupSuppressionMode | string | null;
  suppressionDurationSeconds?: number | null;
  ctaLookup?: PlatformPopupCtaTargetLookup | null;
  suppressions?: readonly PlatformPopupSuppressionRecord[];
  campaignRevision?: string | null;
  /** Actor last impression — drives rotation (null = never shown). */
  lastImpressionAt?: string | Date | null;
};

export type ResolvePopupAdInput = {
  pathname: string | null | undefined;
  now: Date;
  criticalUi?: Partial<PlatformPopupCriticalUiSnapshot> | null;
  sessionKey?: string | null;
  candidates: readonly PlatformPopupCandidate[];
  /** Optional pre-resolved surface; if omitted, derived from pathname+criticalUi. */
  resolvedSurface?: PlatformPopupConsumerSurface | null;
  /**
   * Same-Event coordination — Event ids intentionally opened this session
   * via POPUP/BANNER/PUSH/BELL. Does not replace campaign frequency suppressions.
   */
  coordinatedEventIds?: ReadonlySet<string> | readonly string[] | null;
};

export type ResolvePopupAdWinner = {
  campaignId: string;
  creativeId: string;
  surface: PlatformPopupConsumerSurface;
  href: string;
  presentationType: PlatformPopupInterruptivePresentation;
  frequencyMode: PlatformPopupFrequencyMode;
  creativeMode: PlatformPopupCreativeMode;
};

export type ResolvePopupAdResult =
  | { ok: true; winner: ResolvePopupAdWinner | null; reason?: string }
  | { ok: false; error: string };

export function resolvePopupAd(input: ResolvePopupAdInput): ResolvePopupAdResult {
  if (isPlatformPopupDeferredByCriticalUi(input.criticalUi)) {
    return { ok: true, winner: null, reason: "critical_ui_deferred" };
  }

  const surfaceCtx = toResolveDibaySurfaceContext(input.criticalUi);
  const resolved =
    input.resolvedSurface ??
    (() => {
      const s = resolveDibaySurface(input.pathname, surfaceCtx);
      return isPlatformPopupAdvertisingSurface(s) ? s : null;
    })();

  if (!resolved) {
    return { ok: true, winner: null, reason: "surface_excluded_or_unknown" };
  }

  const eligible: PlatformPopupCandidate[] = [];

  for (const c of input.candidates) {
    if (!isPlatformPopupStatusScheduleEligible(c.status, c.approvalStatus)) continue;
    if (
      !isPlatformPopupWithinScheduleWindow({
        now: input.now,
        startAt: c.startAt,
        endAt: c.endAt,
      })
    ) {
      continue;
    }
    if (!platformPopupSurfaceMatches(c.surfaces, resolved)) continue;

    const presentationType = normalizePlatformPopupPresentationType(c.presentationType);
    if (!isPlatformPopupInterruptivePresentation(presentationType)) {
      continue; // banner presentations: non-interruptive host (later CUT)
    }

    const creative = c.creative;
    if (!creative || creative.status !== "ready") continue;
    const creativeMode = normalizePlatformPopupCreativeMode(creative.creativeMode);
    // Same aspect authority as Admin approval (Artwork intrinsic / Card 36:25).
    if (
      !isPlatformPopupCreativeAspectValid(creative.aspectW, creative.aspectH, creativeMode)
    ) {
      continue;
    }

    const cta = validatePlatformPopupCta(
      {
        ctaType: c.ctaType,
        ctaTarget: c.ctaTarget,
        externalUrl: c.externalUrl,
      },
      c.ctaLookup
    );
    if (!cta.ok) continue;

    if (
      isPopupCandidateCoordinatedAway({
        ctaType: c.ctaType,
        ctaTarget: c.ctaTarget,
        href: cta.value.href,
        coordinatedEventIds: input.coordinatedEventIds,
      })
    ) {
      continue;
    }

    const suppressed = (c.suppressions ?? []).some((row) =>
      isPlatformPopupSuppressionActive(row, {
        now: input.now,
        currentSessionKey: input.sessionKey,
        currentCampaignRevision: c.campaignRevision,
        timezone: c.timezone,
      })
    );
    if (suppressed) continue;

    eligible.push(c);
  }

  if (eligible.length === 0) {
    return { ok: true, winner: null, reason: "no_eligible_campaign" };
  }

  const sorted = [...eligible].sort(comparePopupCandidatesForRotation);
  const winner = sorted[0]!;
  const cta = validatePlatformPopupCta(
    {
      ctaType: winner.ctaType,
      ctaTarget: winner.ctaTarget,
      externalUrl: winner.externalUrl,
    },
    winner.ctaLookup
  );
  if (!cta.ok || !winner.creative) {
    return { ok: true, winner: null, reason: "winner_cta_invalid" };
  }

  const presentationType = normalizePlatformPopupPresentationType(
    winner.presentationType
  ) as PlatformPopupInterruptivePresentation;
  const frequencyMode = normalizePlatformPopupFrequencyMode(winner.frequencyMode);
  const creativeMode = normalizePlatformPopupCreativeMode(winner.creative.creativeMode);

  return {
    ok: true,
    winner: {
      campaignId: winner.id,
      creativeId: winner.creative.id,
      surface: resolved,
      href: cta.value.href,
      presentationType,
      frequencyMode,
      creativeMode,
    },
  };
}
