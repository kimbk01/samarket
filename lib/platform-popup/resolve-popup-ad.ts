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
import { suppressionModesHonoredByFrequency } from "@/lib/platform-popup/dismiss-ssot";
import { comparePopupCandidatesForRotation } from "@/lib/platform-popup/popup-rotation";
import {
  isPlatformPopupInterruptivePresentation,
  isPlatformPopupPtrRevealPresentation,
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
  normalizePlatformPopupPresentationType,
  normalizePlatformPopupTooltipAnchor,
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
  /** 진입 감사 PO-2 — 진입 대기열 구분(없음 = optional) · 자동 닫힘 초(없음 = 없음) */
  queueClass?: string | null;
  autoDismissSeconds?: number | null;
  /** 진입 감사 PO-3 — 그림 전체형 버튼 색 · 목록 시트 매장 · 말풍선 자리 */
  ctaBgColor?: string | null;
  ctaTextColor?: string | null;
  listStoreIds?: readonly string[] | null;
  tooltipAnchor?: string | null;
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
 * v3 ④ (앱 진입 어드민 · Owner 2026-11-17 「v3대로 진행」) — 후보 1개 자격 판정. 탈락하면 첫 이유를 돌려준다.
 * 앱 조회(`selectPlatformPopupEligibleWinner`)와 어드민 「앱에 나오나」(`admin-applied-status.ts`)가 이 함수 하나를 쓴다
 * (두 곳이 따로 판정해 어긋나지 않게).
 *
 * - `resolvedSurface: null` = 영역 판정 생략(어드민: 보는 화면마다 다름) — 대신 노출 위치가 하나도 없으면 탈락.
 * - `viewer: null` = 보는 사람별 판정 생략(PTR 제한 노출 · 같은 이벤트 조율 · 빈도 숨김).
 */
export type PlatformPopupGateViewer = {
  viewerUserId?: string | null;
  coordinatedEventIds?: ReadonlySet<string> | readonly string[] | null;
  sessionKey?: string | null;
};

export type PlatformPopupCandidateGateReason =
  | "not_approved"
  | "status_inactive"
  | "schedule_not_started"
  | "schedule_ended"
  | "surface_none"
  | "surface_mismatch"
  | "presentation_out_of_scope"
  | "tooltip_home_only"
  | "tooltip_member_only"
  | "audience_excluded"
  | "owner_store_ineligible"
  | "creative_missing"
  | "creative_mode_mismatch"
  | "creative_aspect_invalid"
  | "cta_invalid"
  | "coordinated_away"
  | "suppressed";

export type PlatformPopupCandidateGateResult =
  | { ok: true; href: string }
  | { ok: false; reason: PlatformPopupCandidateGateReason; ctaError?: string };

export function evaluatePlatformPopupCandidateGates(
  c: PlatformPopupCandidate,
  ctx: {
    now: Date;
    scope: PlatformPopupPresentationScope;
    resolvedSurface: PlatformPopupConsumerSurface | null;
    viewer: PlatformPopupGateViewer | null;
  }
): PlatformPopupCandidateGateResult {
  if (!isPlatformPopupStatusScheduleEligible(c.status, c.approvalStatus)) {
    return { ok: false, reason: c.approvalStatus !== "approved" ? "not_approved" : "status_inactive" };
  }
  if (
    !isPlatformPopupWithinScheduleWindow({
      now: ctx.now,
      startAt: c.startAt,
      endAt: c.endAt,
    })
  ) {
    const start = c.startAt == null ? null : c.startAt instanceof Date ? c.startAt : new Date(c.startAt);
    const notStarted = start != null && !Number.isNaN(start.getTime()) && ctx.now.getTime() < start.getTime();
    return { ok: false, reason: notStarted ? "schedule_not_started" : "schedule_ended" };
  }
  if (ctx.resolvedSurface) {
    if (!platformPopupSurfaceMatches(c.surfaces, ctx.resolvedSurface)) return { ok: false, reason: "surface_mismatch" };
  } else if (c.surfaces.length === 0) {
    return { ok: false, reason: "surface_none" };
  }

  const presentationType = normalizePlatformPopupPresentationType(c.presentationType);
  if (ctx.scope === "ptr_reveal") {
    if (!isPlatformPopupPtrRevealPresentation(presentationType)) {
      return { ok: false, reason: "presentation_out_of_scope" };
    }
    // Fail-closed allowlist — empty list / anonymous / miss → skip. Interruptive scope ignores this.
    if (
      ctx.viewer &&
      !isPtrRevealAudienceAllowed({
        audienceMode: c.audienceMode,
        audienceUserIds: c.audienceUserIds,
        viewerUserId: ctx.viewer.viewerUserId,
      })
    ) {
      return { ok: false, reason: "audience_excluded" };
    }
  } else if (!isPlatformPopupInterruptivePresentation(presentationType)) {
    return { ok: false, reason: "presentation_out_of_scope" }; // banner / ptr_reveal presentations: non-interruptive hosts
  } else if (presentationType === "tooltip") {
    /**
     * 빌드 전 감사 P3 / RA-5 (2026-11-17): 말풍선 자리는 홈 머리줄에만 있다 — 홈이 아닌 화면에서는 후보가 아니다
     * (예전: 자리 없는 말풍선이 1순위로 뽑혀 다른 팝업 자리를 먹고, 이번 실행 동안 막혀 홈에서도 안 나왔다).
     * 어드민(영역 없음)은 노출 위치에 홈이 없으면 탈락.
     */
    const onHome = ctx.resolvedSurface
      ? ctx.resolvedSurface === "HOME"
      : platformPopupSurfaceMatches(c.surfaces, "HOME");
    if (!onHome) return { ok: false, reason: "tooltip_home_only" };
    // 알림 종 자리는 회원 화면에만 있다 — 보는 사람 판정이 있을 때 비회원이면 탈락
    if (ctx.viewer && normalizePlatformPopupTooltipAnchor(c.tooltipAnchor) === "notifications" && !ctx.viewer.viewerUserId) {
      return { ok: false, reason: "tooltip_member_only" };
    }
  }

  if (c.ownerStoreEligible === false) return { ok: false, reason: "owner_store_ineligible" };

  const creative = c.creative;
  if (!creative || creative.status !== "ready") return { ok: false, reason: "creative_missing" };
  const creativeMode = normalizePlatformPopupCreativeMode(creative.creativeMode);
  // 소재 계열 일치 — PTR 은 ptr_band 만, 팝업은 ptr_band 금지
  if ((ctx.scope === "ptr_reveal") !== (creativeMode === "ptr_band")) {
    return { ok: false, reason: "creative_mode_mismatch" };
  }
  // Same aspect authority as Admin approval (Artwork intrinsic / Card 36:25).
  if (!isPlatformPopupCreativeAspectValid(creative.aspectW, creative.aspectH, creativeMode)) {
    return { ok: false, reason: "creative_aspect_invalid" };
  }

  const cta = validatePlatformPopupCta(
    {
      ctaType: c.ctaType,
      ctaTarget: c.ctaTarget,
      externalUrl: c.externalUrl,
    },
    c.ctaLookup
  );
  if (!cta.ok) return { ok: false, reason: "cta_invalid", ctaError: cta.error };

  if (ctx.viewer) {
    if (
      isPopupCandidateCoordinatedAway({
        ctaType: c.ctaType,
        ctaTarget: c.ctaTarget,
        href: cta.value.href,
        coordinatedEventIds: ctx.viewer.coordinatedEventIds,
      })
    ) {
      return { ok: false, reason: "coordinated_away" };
    }

    // F-2: 지금 빈도가 인정하는 숨김 행만 본다 (예전 빈도로 남은 행은 무시)
    const honoredModes = suppressionModesHonoredByFrequency(c.frequencyMode);
    const viewer = ctx.viewer;
    const suppressed = (c.suppressions ?? []).some((row) =>
      honoredModes.has(row.mode) &&
      isPlatformPopupSuppressionActive(row, {
        now: ctx.now,
        currentSessionKey: viewer.sessionKey,
        currentCampaignRevision: c.campaignRevision,
        timezone: c.timezone,
      })
    );
    if (suppressed) return { ok: false, reason: "suppressed" };
  }

  return { ok: true, href: cta.value.href };
}

/** 후보 + 이동 주소 + 영역 → 조회 1위 모양 (앱 조회 · 어드민 「앱에 나오나」 공용) */
export function toResolvePopupAdWinner(
  winner: PlatformPopupCandidate,
  surface: PlatformPopupConsumerSurface,
  href: string
): ResolvePopupAdWinner | null {
  if (!winner.creative) return null;
  return {
    campaignId: winner.id,
    creativeId: winner.creative.id,
    surface,
    href,
    presentationType: normalizePlatformPopupPresentationType(
      winner.presentationType
    ) as PlatformPopupInterruptivePresentation,
    frequencyMode: normalizePlatformPopupFrequencyMode(winner.frequencyMode),
    creativeMode: normalizePlatformPopupCreativeMode(winner.creative.creativeMode),
  };
}

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
  const viewer: PlatformPopupGateViewer = {
    viewerUserId: input.viewerUserId,
    coordinatedEventIds: input.coordinatedEventIds,
    sessionKey: input.sessionKey,
  };

  for (const c of input.candidates) {
    // v3 ④: 자격 판정은 이유를 돌려주는 한 함수 — 어드민 「앱에 나오나」와 같은 함수(`admin-applied-status.ts`)
    const gate = evaluatePlatformPopupCandidateGates(c, {
      now: input.now,
      scope,
      resolvedSurface: resolved,
      viewer,
    });
    if (!gate.ok) continue;
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
  const mapped = toResolvePopupAdWinner(winner, resolved, href);
  if (!mapped) return { ok: true, winner: null, reason: "winner_cta_invalid" };
  return { ok: true, winner: mapped };
}
