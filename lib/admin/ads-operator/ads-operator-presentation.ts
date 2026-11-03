/**
 * Shared Ads operator PRESENTATION only — no mutation / no unified Ads SSOT.
 */

import { humanPlacementLabelOrNull } from "@/lib/admin/ads-exposure/human-placement-label";
import {
  formatAdsPeriodRange,
  formatAdsRemaining,
} from "@/lib/admin/ads-exposure/canonical-location-period";

export type AdsOperatorExposureState =
  | "not_yet"
  | "scheduled"
  | "exposing"
  | "paused"
  | "hidden"
  | "ineligible"
  | "ended";

export function adsOperatorExposureLabel(state: AdsOperatorExposureState, ko: boolean): string {
  switch (state) {
    case "not_yet":
      return ko ? "아직 노출 안 됨" : "Not exposed yet";
    case "scheduled":
      return ko ? "예약됨" : "Scheduled";
    case "exposing":
      return ko ? "노출 중" : "Live now";
    case "paused":
      return ko ? "일시중지" : "Paused";
    case "hidden":
      // No product HIDDEN state for Delivery/Feed — do not present as operator verb.
      return ko ? "노출 불가" : "Not eligible";
    case "ineligible":
      return ko ? "노출 불가" : "Not eligible";
    case "ended":
      return ko ? "종료" : "Ended";
  }
}

/** ACTIVE lifecycle ≠ exposing — combine schedule + eligibility. */
export function deriveAdsOperatorExposure(input: {
  lifecycle: string;
  startAt?: string | null;
  endAt?: string | null;
  eligibleNow?: boolean | null;
  nowMs?: number;
}): AdsOperatorExposureState {
  const life = String(input.lifecycle ?? "").trim().toUpperCase();
  const now = input.nowMs ?? Date.now();
  if (life === "ENDED" || life === "CANCELLED" || life === "REJECTED" || life === "ARCHIVED") {
    return "ended";
  }
  if (life.startsWith("PAUSED") || life === "HIDDEN") {
    return life === "HIDDEN" ? "hidden" : "paused";
  }
  const start = input.startAt ? new Date(input.startAt).getTime() : NaN;
  const end = input.endAt ? new Date(input.endAt).getTime() : NaN;
  if (Number.isFinite(end) && end < now) return "ended";
  if (life === "SCHEDULED" || (Number.isFinite(start) && start > now)) return "scheduled";
  if (life === "ACTIVE" || life === "APPROVED") {
    if (input.eligibleNow === false) return "ineligible";
    if (Number.isFinite(start) && start > now) return "scheduled";
    if (input.eligibleNow === true) return "exposing";
    // Unknown eligibility: do not claim live
    if (Number.isFinite(start) && start <= now && (!Number.isFinite(end) || end >= now)) {
      return input.eligibleNow == null ? "scheduled" : "exposing";
    }
    return "not_yet";
  }
  if (life.includes("REVIEW") || life === "SUBMITTED" || life === "DRAFT") return "not_yet";
  return "not_yet";
}

export function adsRemainingPeriodLabel(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  ko: boolean,
  nowMs = Date.now()
): string {
  return formatAdsRemaining(startAt, endAt, nowMs, ko).label;
}

export function formatAdsPeriod(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  _locale = "ko-KR"
): string {
  void _locale;
  return formatAdsPeriodRange(startAt, endAt, true).label;
}

const TEST_NAME_RE =
  /(\[QA[^\]]*\]|\[테스트\]|QA[-_\s]|currency-prod-e2e|Geometry|PROD[_-]{1,2}|\[RUNTIME\]|\[EXIT\]|e2e[-_])/i;

export function isAdsTestFixtureLabel(label: string | null | undefined): boolean {
  return TEST_NAME_RE.test(String(label ?? ""));
}

export function adsDisplayTitle(label: string | null | undefined, ko: boolean): string {
  const raw = String(label ?? "").trim() || (ko ? "(제목 없음)" : "(untitled)");
  if (isAdsTestFixtureLabel(raw)) {
    const cleaned = raw.replace(/^\[QA[^\]]*\]\s*/i, "").trim() || raw;
    return ko ? `[테스트] ${cleaned}` : `[Test] ${cleaned}`;
  }
  return raw;
}

/** Human placement breadcrumb — never show raw inventory key as primary. */
export function adsPlacementBreadcrumb(input: {
  domain: "delivery" | "trade" | "community" | "popup" | string;
  inventoryKey?: string | null;
  placementHint?: string | null;
  ko: boolean;
}): string {
  if (input.placementHint && !/^[A-Z0-9_]+$/.test(input.placementHint.trim())) {
    return input.placementHint.trim();
  }
  const key = String(input.inventoryKey ?? "").trim();
  // 광고 감사 A-5: 지면 이름은 `human-placement-label` 하나만 쓴다 (같은 지면에 이름 여러 개 금지)
  const hit = humanPlacementLabelOrNull(key, input.ko);
  if (hit) return hit;
  if (input.placementHint) return input.placementHint;
  const domainKo: Record<string, string> = {
    delivery: "배달",
    trade: "거래",
    community: "커뮤니티",
    popup: "팝업",
  };
  const d = domainKo[input.domain] ?? input.domain;
  return input.ko ? `${d} · 노출 위치` : `${input.domain} · placement`;
}

export type AdsCtaTier = "primary" | "secondary" | "more" | "danger";

export function adsPaymentStateLabel(
  state: string | null | undefined,
  currency: "CASH" | "POINT" | "UNKNOWN",
  ko: boolean
): string {
  const s = String(state ?? "").trim().toLowerCase();
  const cur = currency === "POINT" ? (ko ? "Point" : "Point") : currency === "CASH" ? (ko ? "Cash" : "Cash") : "";
  if (!s || s === "unknown") return ko ? `결제 확인 필요${cur ? ` · ${cur}` : ""}` : `Payment unclear${cur ? ` · ${cur}` : ""}`;
  if (/(paid|captured|complete|settled|success)/.test(s)) {
    return ko ? `결제 완료${cur ? ` · ${cur}` : ""}` : `Paid${cur ? ` · ${cur}` : ""}`;
  }
  if (/(hold|pending|processing)/.test(s)) {
    return ko ? `결제 확인 중${cur ? ` · ${cur}` : ""}` : `Payment pending${cur ? ` · ${cur}` : ""}`;
  }
  if (/(unpaid|none|await)/.test(s)) {
    return ko ? `결제 전${cur ? ` · ${cur}` : ""}` : `Unpaid${cur ? ` · ${cur}` : ""}`;
  }
  if (/refund/.test(s)) {
    return ko ? `환불 관련${cur ? ` · ${cur}` : ""}` : `Refund${cur ? ` · ${cur}` : ""}`;
  }
  return ko ? `${s}${cur ? ` · ${cur}` : ""}` : `${s}${cur ? ` · ${cur}` : ""}`;
}
