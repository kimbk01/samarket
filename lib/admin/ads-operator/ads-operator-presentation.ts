/**
 * Shared Ads operator PRESENTATION only — no mutation / no unified Ads SSOT.
 */

import { humanPlacementLabelOrNull } from "@/lib/admin/ads-exposure/human-placement-label";
import {
  formatAdsPeriodRange,
  formatAdsRemaining,
} from "@/lib/admin/ads-exposure/canonical-location-period";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
      return tx(ko, "admin_ads_operator_not_exposed_yet");
    case "scheduled":
      return tx(ko, "admin_ads_operator_scheduled");
    case "exposing":
      return tx(ko, "admin_ads_operator_live_now");
    case "paused":
      return tx(ko, "common_paused");
    case "hidden":
      // No product HIDDEN state for Delivery/Feed — do not present as operator verb.
      return tx(ko, "admin_ads_operator_not_eligible");
    case "ineligible":
      return tx(ko, "admin_ads_operator_not_eligible");
    case "ended":
      return tx(ko, "admin_ads_exposure_ended");
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
  const raw = String(label ?? "").trim() || tx(ko, "admin_ads_operator_untitled");
  if (isAdsTestFixtureLabel(raw)) {
    const cleaned = raw.replace(/^\[QA[^\]]*\]\s*/i, "").trim() || raw;
    return tx(ko, "admin_ads_operator_test", { title: String(cleaned) });
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
  return tx(input.ko, "admin_ads_operator_domain_placement", { domain: input.ko ? d : input.domain });
}

export type AdsCtaTier = "primary" | "secondary" | "more" | "danger";

export function adsPaymentStateLabel(
  state: string | null | undefined,
  currency: "CASH" | "POINT" | "UNKNOWN",
  ko: boolean
): string {
  const s = String(state ?? "").trim().toLowerCase();
  const cur = currency === "POINT" ? (ko ? "Point" : "Point") : currency === "CASH" ? (ko ? "Cash" : "Cash") : "";
  const curSuffix = cur ? ` · ${cur}` : "";
  if (!s || s === "unknown") return tx(ko, "admin_ads_operator_payment_unclear", { cur: curSuffix });
  if (/(paid|captured|complete|settled|success)/.test(s)) {
    return tx(ko, "admin_ads_operator_paid", { cur: curSuffix });
  }
  if (/(hold|pending|processing)/.test(s)) {
    return tx(ko, "admin_ads_operator_payment_pending", { cur: curSuffix });
  }
  if (/(unpaid|none|await)/.test(s)) {
    return tx(ko, "admin_ads_operator_unpaid", { cur: curSuffix });
  }
  if (/refund/.test(s)) {
    return tx(ko, "admin_ads_operator_refund", { cur: curSuffix });
  }
  return `${s}${curSuffix}`;
}
