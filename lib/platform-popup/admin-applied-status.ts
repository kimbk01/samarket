/**
 * v3 ④ (앱 진입 어드민 §6 · Owner 2026-11-17 「v3대로 진행」) — 팝업 「앱에 나오나」 서버 계산(단일 정의).
 *
 * 앱 조회(`app/api/platform-popup/resolve/route.ts`)와 같은 재료·같은 함수로 계산한다:
 * - 전체 설정 켜짐(`loadPlatformPopupEntryPolicyFromStore`)
 * - 후보 = `loadPlatformPopupCandidates` (앱과 같은 쿼리 · 목적지 조회 · 매장 자격) — 보는 사람 없이 부르므로 숨김·최근 노출은 비어 있다
 * - 자격 = `evaluatePlatformPopupCandidateGates` (승인·상태·기간·노출 위치·소재·이동 대상) — 영역·보는 사람 판정만 뺀다
 * - 표시 단계 = `buildPlatformPopupPresentationWinner` + 혜택(`loadPopupCandidateEventBenefit`) + 목록 매장(`loadPlatformPopupListStores`)
 * - 쿠폰 카드 = 조건부(7일 안 만료 쿠폰 있는 회원만) · 말풍선 = 홈이 없는 노출 위치면 안 나옴(자격 함수 `tooltip_home_only` · 빌드 전 감사 A1)
 * 회원별 숨김(닫음·하루 1번)·이번 실행 숨김은 사람마다 달라 넣지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPlatformPopupPresentationWinner } from "@/lib/platform-popup/build-presentation-winner";
import type { PlatformPopupEventBenefitContent } from "@/lib/platform-popup/event-benefit-authority";
import { loadPlatformPopupListStores } from "@/lib/platform-popup/entry-queue-enrich";
import {
  loadPlatformPopupEntryPolicyCached,
  loadPlatformPopupEntryPolicyFromStore,
} from "@/lib/platform-popup/entry-policy-server";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import { loadPopupCandidateEventBenefit } from "@/lib/platform-popup/popup-present-requirements";
import { normalizePlatformPopupPresentationType } from "@/lib/platform-popup/presentation-contract";
import {
  evaluatePlatformPopupCandidateGates,
  toResolvePopupAdWinner,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";
import type { PlatformPopupConsumerSurface } from "@/lib/platform-popup/types";
import {
  platformPopupAppliedStatusFromRow,
  type PlatformPopupAppliedStatus,
} from "@/lib/platform-popup/admin-applied-status-contract";

export { platformPopupAppliedStatusFromRow };

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 표시 단계 확인용 영역 — 실제 판정은 영역 무관(노출 위치마다 같은 결과) */
function representativeSurface(c: PlatformPopupCandidate): PlatformPopupConsumerSurface {
  const first = c.surfaces.find((s) => s !== "GLOBAL");
  return (first as PlatformPopupConsumerSurface | undefined) ?? "HOME";
}

/**
 * 순수 계산 — 후보 1개 + 미리 읽은 표시 단계 데이터.
 * `eventBenefit`: 혜택 다이얼로그일 때만 의미(읽은 결과 · 없음 = null)
 * `listStoreCount`: 하단 목록일 때만 의미(노출 자격 매장 수)
 */
export function computePlatformPopupAppliedStatus(input: {
  candidate: PlatformPopupCandidate;
  now: Date;
  policyEnabled: boolean;
  eventBenefit?: PlatformPopupEventBenefitContent | null;
  listStoreCount?: number | null;
}): PlatformPopupAppliedStatus {
  const c = input.candidate;
  if (!input.policyEnabled) return { state: "not_shown", reason: "policy_disabled" };

  const gateCtx = { scope: "interruptive" as const, resolvedSurface: null, viewer: null };
  let gate = evaluatePlatformPopupCandidateGates(c, { ...gateCtx, now: input.now });
  let startsAt: Date | null = null;
  if (!gate.ok && gate.reason === "schedule_not_started") {
    // 예약 — 시작 시각 기준으로 나머지 조건(소재·이동 대상 등)도 확인한다
    startsAt = toDate(c.startAt);
    if (startsAt) gate = evaluatePlatformPopupCandidateGates(c, { ...gateCtx, now: startsAt });
  }
  if (!gate.ok) {
    return { state: "not_shown", reason: gate.reason, ...(gate.ctaError ? { ctaError: gate.ctaError } : {}) };
  }

  const presentationType = normalizePlatformPopupPresentationType(c.presentationType);
  const winner = toResolvePopupAdWinner(c, representativeSurface(c), gate.href);
  if (!winner || !c.creative) return { state: "not_shown", reason: "creative_missing" };

  let eventBenefit: PlatformPopupEventBenefitContent | null = null;
  if (presentationType === "benefit_dialog") {
    eventBenefit = input.eventBenefit ?? null;
    if (!eventBenefit) return { state: "not_shown", reason: "benefit_content_required" };
  }
  const presentation = buildPlatformPopupPresentationWinner(
    winner,
    c,
    { assetUrl: c.creative.assetUrl ?? null, assetPath: c.creative.assetPath ?? null, altText: c.creative.altText ?? null },
    {
      suppressionMode: c.suppressionMode,
      suppressionDurationSeconds: c.suppressionDurationSeconds,
      timezone: c.timezone,
      ctaLabel: c.ctaLabel ?? null,
      title: c.title ?? null,
      body: c.body ?? null,
      frequencyMode: c.frequencyMode,
    },
    eventBenefit
  );
  if (!presentation) return { state: "not_shown", reason: "presentation_invalid" };

  if (presentationType === "list_sheet" && !(Number(input.listStoreCount ?? 0) > 0)) {
    return { state: "not_shown", reason: "list_stores_empty" };
  }

  if (startsAt) return { state: "scheduled", reason: "starts_at", startsAt: startsAt.toISOString() };

  if (presentationType === "coupon_card") return { state: "conditional", reason: "coupon_members_only" };
  return { state: "live", reason: null };
}

export type PlatformPopupAppliedStatusIndex = {
  policyEnabled: boolean;
  /** 후보(승인 · 노출/예약 상태) 캠페인만 — 나머지는 `platformPopupAppliedStatusFromRow` */
  byId: Map<string, PlatformPopupAppliedStatus>;
};

async function loadPolicyEnabled(): Promise<boolean> {
  try {
    // 어드민은 방금 저장한 값을 본다(캐시 아님). 읽기 실패면 앱과 같은 캐시 값.
    return (await loadPlatformPopupEntryPolicyFromStore()).policy.enabled;
  } catch {
    return (await loadPlatformPopupEntryPolicyCached()).enabled;
  }
}

/** 후보 전체의 「앱에 나오나」 — 목록 필터(「앱에 나오는 중」·「안 나옴」)와 각 행 표시가 같은 결과를 쓴다 */
export async function loadPlatformPopupAppliedStatusIndex(
  sb: SupabaseClient,
  opts?: {
    now?: Date;
    /** 빌드 전 감사 A4: 상세처럼 캠페인 몇 개만 볼 때 — 표시 단계 확인(혜택·목록 매장 조회)을 그 캠페인만 한다 */
    campaignIds?: readonly string[];
  }
): Promise<PlatformPopupAppliedStatusIndex> {
  const now = opts?.now ?? new Date();
  const [policyEnabled, loaded] = await Promise.all([loadPolicyEnabled(), loadPlatformPopupCandidates(sb, {})]);
  const only = opts?.campaignIds ? new Set(opts.campaignIds) : null;
  const candidates = only ? loaded.filter((c) => only.has(c.id)) : loaded;
  const byId = new Map<string, PlatformPopupAppliedStatus>();
  const extras = await Promise.all(
    candidates.map(async (c) => {
      if (!policyEnabled) return { benefit: null, listCount: null };
      const type = normalizePlatformPopupPresentationType(c.presentationType);
      if (type === "benefit_dialog") return { benefit: await loadPopupCandidateEventBenefit(sb, c), listCount: null };
      if (type === "list_sheet") {
        return { benefit: null, listCount: (await loadPlatformPopupListStores(sb, c.listStoreIds ?? null)).length };
      }
      return { benefit: null, listCount: null };
    })
  );
  candidates.forEach((c, i) => {
    byId.set(
      c.id,
      computePlatformPopupAppliedStatus({
        candidate: c,
        now,
        policyEnabled,
        eventBenefit: extras[i]!.benefit,
        listStoreCount: extras[i]!.listCount,
      })
    );
  });
  return { policyEnabled, byId };
}

export function platformPopupAppliedStatusFor(
  index: PlatformPopupAppliedStatusIndex,
  row: { id: string; status: string; approvalStatus: string }
): PlatformPopupAppliedStatus {
  return (
    index.byId.get(row.id) ??
    platformPopupAppliedStatusFromRow({ status: row.status, approvalStatus: row.approvalStatus, policyEnabled: index.policyEnabled })
  );
}
