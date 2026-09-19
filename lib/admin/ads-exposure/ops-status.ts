/**
 * Canonical ops status labels — Admin ↔ Member ↔ Owner presentation.
 * Internal enums stay in domain writers; UI uses these only.
 *
 * CUT B — EFFECTIVE LIFECYCLE SSOT (HARD LOCK candidate):
 * STORED STATUS ≠ EFFECTIVE STATE. Display/ops consumers MUST use
 * `projectAdsEffectiveLifecycle` (or `projectAdsOpsStatus` with schedule).
 * Never treat raw `active` alone as LIVE / eligibleNow.
 *
 * This module is DISPLAY / OPERATIONAL projection only — not a customer
 * campaign selector and not a DB writer.
 */

export type AdsOpsStatus =
  | "pending"
  | "scheduled"
  | "live"
  | "paused"
  | "ended"
  | "rejected"
  | "draft"
  | "archived";

/**
 * Customer loader end-boundary parity.
 * - exclusive (Feed Banner `isFeedAdCampaignEligibleNow`): ended when endAt <= now
 * - inclusive (Boost `isLiveTradePromotionEntitlement`): ended when endAt < now
 */
export type AdsScheduleEndBoundary = "exclusive" | "inclusive";

export type AdsEffectiveNotLiveReason =
  | "pending"
  | "rejected"
  | "draft"
  | "archived"
  | "paused"
  | "not_started"
  | "expired"
  | "ended"
  | null;

export type AdsEffectiveLifecycle = {
  /** Raw persisted status string (trimmed); not rewritten. */
  storedStatus: string;
  /** Schedule-aware operational state for Admin/Member/Owner presentation. */
  effectiveStatus: AdsOpsStatus;
  /**
   * Schedule window only — true iff effectiveStatus === "live".
   * Domain loaders may still apply target/geo/creative gates on top.
   */
  customerEligibleNow: boolean;
  reason: AdsEffectiveNotLiveReason;
};

const LABELS: Record<AdsOpsStatus, { ko: string; en: string }> = {
  pending: { ko: "승인 대기", en: "Pending approval" },
  scheduled: { ko: "예약", en: "Scheduled" },
  live: { ko: "노출 중", en: "Live" },
  paused: { ko: "일시중지", en: "Paused" },
  ended: { ko: "종료", en: "Ended" },
  rejected: { ko: "반려", en: "Rejected" },
  draft: { ko: "임시저장", en: "Draft" },
  archived: { ko: "삭제됨", en: "Removed" },
};

export function adsOpsStatusLabel(status: AdsOpsStatus, ko: boolean): string {
  return ko ? LABELS[status].ko : LABELS[status].en;
}

export function mapRawToAdsOpsStatus(raw: string): AdsOpsStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "ended";
  if (s.includes("archiv") || s.includes("deleted") || s.includes("삭제")) return "archived";
  if (s.includes("draft") || s.includes("임시")) return "draft";
  if (
    s.includes("pending") ||
    s.includes("review") ||
    s.includes("submitted") ||
    s.includes("대기") ||
    s.includes("검토") ||
    s === "held"
  ) {
    return "pending";
  }
  if (s.includes("schedul") || s.includes("예약") || s.includes("approved")) {
    // approved before window → scheduled; if also "active" handled below
    if (s.includes("active") || s.includes("노출")) return "live";
    return "scheduled";
  }
  if (s.includes("pause") || s.includes("중지") || s.includes("hold")) return "paused";
  if (s.includes("reject") || s.includes("반려") || s.includes("거절")) return "rejected";
  if (
    s.includes("end") ||
    s.includes("expir") ||
    s.includes("cancel") ||
    s.includes("terminat") ||
    s.includes("종료")
  ) {
    return "ended";
  }
  if (s.includes("active") || s.includes("노출") || s.includes("live") || s.includes("exposing")) {
    return "live";
  }
  return "ended";
}

function isPastEnd(endMs: number, nowMs: number, boundary: AdsScheduleEndBoundary): boolean {
  if (boundary === "inclusive") return endMs < nowMs;
  return endMs <= nowMs;
}

/** Project ops status from lifecycle + schedule window. */
export function projectAdsOpsStatus(input: {
  rawStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  nowMs?: number;
  /** Default exclusive — matches Feed Banner loader. Boost: pass inclusive. */
  endBoundary?: AdsScheduleEndBoundary;
}): AdsOpsStatus {
  const base = mapRawToAdsOpsStatus(input.rawStatus);
  if (base === "rejected" || base === "ended" || base === "archived" || base === "draft") {
    return base;
  }
  if (base === "paused" || base === "pending") return base;

  const now = input.nowMs ?? Date.now();
  const boundary = input.endBoundary ?? "exclusive";
  const start = input.startAt ? Date.parse(input.startAt) : NaN;
  const end = input.endAt ? Date.parse(input.endAt) : NaN;
  if (Number.isFinite(end) && isPastEnd(end, now, boundary)) return "ended";
  if (base === "live" || base === "scheduled") {
    if (Number.isFinite(start) && start > now) return "scheduled";
    if (base === "scheduled" && (!Number.isFinite(start) || start <= now)) return "live";
  }
  return base;
}

function reasonForEffective(
  effective: AdsOpsStatus,
  input: { startAt?: string | null; endAt?: string | null; nowMs: number; endBoundary: AdsScheduleEndBoundary }
): AdsEffectiveNotLiveReason {
  if (effective === "live") return null;
  if (effective === "pending") return "pending";
  if (effective === "rejected") return "rejected";
  if (effective === "draft") return "draft";
  if (effective === "archived") return "archived";
  if (effective === "paused") return "paused";
  if (effective === "scheduled") return "not_started";
  if (effective === "ended") {
    const end = input.endAt ? Date.parse(input.endAt) : NaN;
    if (Number.isFinite(end) && isPastEnd(end, input.nowMs, input.endBoundary)) return "expired";
    return "ended";
  }
  return "ended";
}

/**
 * CUT B canonical read-only operational projection.
 * STORED STATUS remains raw; EFFECTIVE STATE applies schedule window.
 */
export function projectAdsEffectiveLifecycle(input: {
  rawStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  nowMs?: number;
  endBoundary?: AdsScheduleEndBoundary;
}): AdsEffectiveLifecycle {
  const storedStatus = String(input.rawStatus ?? "").trim();
  const nowMs = input.nowMs ?? Date.now();
  const endBoundary = input.endBoundary ?? "exclusive";
  const effectiveStatus = projectAdsOpsStatus({
    rawStatus: storedStatus,
    startAt: input.startAt,
    endAt: input.endAt,
    nowMs,
    endBoundary,
  });
  return {
    storedStatus,
    effectiveStatus,
    customerEligibleNow: effectiveStatus === "live",
    reason: reasonForEffective(effectiveStatus, {
      startAt: input.startAt,
      endAt: input.endAt,
      nowMs,
      endBoundary,
    }),
  };
}
