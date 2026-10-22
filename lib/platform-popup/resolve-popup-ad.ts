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
  isPlatformPopupPtrRevealPresentation,
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
  normalizePlatformPopupPresentationType,
  type PlatformPopupCreativeMode,
  type PlatformPopupFrequencyMode,
  type PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import { isPlatformPopupCreativeAspectValid } from "@/lib/platform-popup/creative-contract";
import { isPtrRevealAudienceAllowed } from "@/lib/platform-popup/ptr-reveal-audience";
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
  /**
   * ADC-02 — 오너 신청 팝업의 연결 매장이 노출 자격(approved · is_visible, 배너 ADS-06 과 동일)을 잃으면 false.
   * 미지정 = 매장 연결 없는 팝업(관리자 직접) → 게이트 대상 아님.
   */
  ownerStoreEligible?: boolean;
  suppressions?: readonly PlatformPopupSuppressionRecord[];
  campaignRevision?: string | null;
  /** Actor last impression — drives rotation (null = never shown). */
  lastImpressionAt?: string | Date | null;
  /** ptr_reveal 전용 — ready 띠 변형(default=creative 와 동일, tablet·logo 선택) */
  ptrBands?: Partial<Record<"default" | "tablet" | "logo", PlatformPopupPtrBandAsset>>;
  /** ptr_reveal 제한 노출 — 기본 all (팝업·공개 PTR). allowlist 는 앱 리졸버에서만 적용. */
  audienceMode?: string | null;
  audienceUserIds?: readonly string[] | null;
};

export type PlatformPopupPtrBandAsset = {
  id: string;
  assetUrl: string | null;
  assetPath: string | null;
  altText: string | null;
  aspectW: number;
  aspectH: number;
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
  /** ptr_reveal allowlist 판정용 — 미로그인·누락 시 allowlist 캠페인은 제외(fail-closed). */
  viewerUserId?: string | null;
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

/**
 * 프레젠테이션 범위 — `interruptive`(GlobalPopupHost 팝업 3종, 기본) · `ptr_reveal`(당겨서 새로고침 띠).
 * 두 범위는 서로의 캠페인을 절대 선택하지 않는다(팝업이 PTR 로, PTR 이 팝업으로 노출 금지).
 */
export type PlatformPopupPresentationScope = "interruptive" | "ptr_reveal";

export type PlatformPopupEligibleSelection =
  | {
      ok: true;
      winner: PlatformPopupCandidate;
      href: string;
      surface: PlatformPopupConsumerSurface;
    }
  | { ok: true; winner: null; reason: string };

/**
 * 공통 자격 판정(승인·기간·대상 화면·소재 비율·CTA·이벤트 조율·빈도 억제) + 회전 정렬 → 0|1 후보.
 */
export function selectPlatformPopupEligibleWinner(
  input: ResolvePopupAdInput,
  scope: PlatformPopupPresentationScope
): PlatformPopupEligibleSelection {
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
    if (scope === "ptr_reveal") {
      if (!isPlatformPopupPtrRevealPresentation(presentationType)) continue;
      // Fail-closed allowlist — empty list / anonymous / miss → skip. Interruptive scope ignores this.
      if (
        !isPtrRevealAudienceAllowed({
          audienceMode: c.audienceMode,
          audienceUserIds: c.audienceUserIds,
          viewerUserId: input.viewerUserId,
        })
      ) {
        continue;
      }
    } else if (!isPlatformPopupInterruptivePresentation(presentationType)) {
      continue; // banner / ptr_reveal presentations: non-interruptive hosts
    }

    if (c.ownerStoreEligible === false) continue;

    const creative = c.creative;
    if (!creative || creative.status !== "ready") continue;
    const creativeMode = normalizePlatformPopupCreativeMode(creative.creativeMode);
    // 소재 계열 일치 — PTR 은 ptr_band 만, 팝업은 ptr_band 금지
    if ((scope === "ptr_reveal") !== (creativeMode === "ptr_band")) continue;
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
  return { ok: true, winner, href: cta.value.href, surface: resolved };
}

export function resolvePopupAd(input: ResolvePopupAdInput): ResolvePopupAdResult {
  const selected = selectPlatformPopupEligibleWinner(input, "interruptive");
  if (!selected.winner) return { ok: true, winner: null, reason: selected.reason };
  const { winner, href, surface: resolved } = selected;
  if (!winner.creative) return { ok: true, winner: null, reason: "winner_cta_invalid" };

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
      href,
      presentationType,
      frequencyMode,
      creativeMode,
    },
  };
}
