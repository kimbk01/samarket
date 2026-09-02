/**
 * Platform Popup CUT 1 — canonical eligibility resolver boundary.
 * Returns exactly 0 or 1 deterministic winner. No UI.
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
import { platformPopupIsDomainTargeted, platformPopupSurfaceMatches } from "@/lib/platform-popup/surfaces";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupConsumerSurface,
  PlatformPopupCtaType,
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
  creative: {
    id: string;
    status: "draft" | "ready" | "rejected";
    aspectW: number;
    aspectH: number;
  } | null;
  ctaType: PlatformPopupCtaType | string;
  ctaTarget?: string | null;
  externalUrl?: string | null;
  ctaLookup?: PlatformPopupCtaTargetLookup | null;
  suppressions?: readonly PlatformPopupSuppressionRecord[];
  campaignRevision?: string | null;
};

export type ResolvePopupAdInput = {
  pathname: string | null | undefined;
  now: Date;
  criticalUi?: Partial<PlatformPopupCriticalUiSnapshot> | null;
  sessionKey?: string | null;
  candidates: readonly PlatformPopupCandidate[];
  /** Optional pre-resolved surface; if omitted, derived from pathname+criticalUi. */
  resolvedSurface?: PlatformPopupConsumerSurface | null;
};

export type ResolvePopupAdWinner = {
  campaignId: string;
  creativeId: string;
  surface: PlatformPopupConsumerSurface;
  href: string;
};

export type ResolvePopupAdResult =
  | { ok: true; winner: ResolvePopupAdWinner | null; reason?: string }
  | { ok: false; error: string };

function compareWinners(a: PlatformPopupCandidate, b: PlatformPopupCandidate): number {
  const aDomain = platformPopupIsDomainTargeted(a.surfaces) ? 1 : 0;
  const bDomain = platformPopupIsDomainTargeted(b.surfaces) ? 1 : 0;
  if (aDomain !== bDomain) return bDomain - aDomain; // domain > GLOBAL
  if (a.priority !== b.priority) return b.priority - a.priority; // DESC
  const aStart = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
  const aStartSafe = Number.isNaN(aStart) ? Number.POSITIVE_INFINITY : aStart;
  const bStartSafe = Number.isNaN(bStart) ? Number.POSITIVE_INFINITY : bStart;
  if (aStartSafe !== bStartSafe) return aStartSafe - bStartSafe; // ASC
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable id
}

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

    const creative = c.creative;
    if (!creative || creative.status !== "ready") continue;
    if (creative.aspectW !== 36 || creative.aspectH !== 25) continue;

    const cta = validatePlatformPopupCta(
      {
        ctaType: c.ctaType,
        ctaTarget: c.ctaTarget,
        externalUrl: c.externalUrl,
      },
      c.ctaLookup
    );
    if (!cta.ok) continue;

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

  const sorted = [...eligible].sort(compareWinners);
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

  return {
    ok: true,
    winner: {
      campaignId: winner.id,
      creativeId: winner.creative.id,
      surface: resolved,
      href: cta.value.href,
    },
  };
}
