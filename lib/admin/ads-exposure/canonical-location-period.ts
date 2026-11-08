/**
 * Canonical Ads location / period / remaining formatter SSOT.
 * OWNER LOCK: FINAL LOCATION/PERIOD + PLACEMENT SEMANTICS.
 * Do NOT invent per-screen date/placement formatters.
 */

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  humanPlacementLabel,
  humanPopupSurfaceShortLabel,
} from "@/lib/admin/ads-exposure/human-placement-label";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type AdsPlacementProductKind =
  | "community_boost"
  | "trade_boost"
  | "delivery_sponsored"
  | "feed_banner"
  | "delivery_banner"
  | "popup";

export type AdsPlacementMode = "requested" | "actual";

const EPOCH_MS = Date.parse("1970-01-01T00:00:00.000Z");
const MIN_SANE_MS = Date.parse("2000-01-01T00:00:00.000Z");

/** Parse ISO/date; reject null, NaN, epoch, and pre-2000 garbage. */
export function parseAdsInstant(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    if (!Number.isFinite(t) || t <= EPOCH_MS + 86_400_000 || t < MIN_SANE_MS) return null;
    return value;
  }
  const raw = String(value).trim();
  if (!raw || raw === "0" || /^1970-01-01/i.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t <= EPOCH_MS + 86_400_000 || t < MIN_SANE_MS) return null;
  return new Date(t);
}

export function formatAdsPeriodRange(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
  ko: boolean
): { label: string; valid: boolean; error: boolean } {
  const s = parseAdsInstant(start);
  const e = parseAdsInstant(end);
  if (!s && !e) {
    return { label: ko ? "—" : "—", valid: false, error: false };
  }
  if (!s || !e) {
    return {
      label: tx(ko, "admin_ads_exposure_period_data_error"),
      valid: false,
      error: true,
    };
  }
  // 실기 v6 FAIL 2-1 (2026-11-07): 실행 기계 시간대(`getHours`)가 아니라 PHT 고정 — 원장 목록은 서버(UTC)에서 만든다
  const fmt = (d: Date) =>
    formatAdminManilaDateTime(d.toISOString()).replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1.$2.$3");
  return { label: `${fmt(s)} ~ ${fmt(e)}`, valid: true, error: false };
}

/**
 * Boost order period bounds for Admin projection.
 * When end_at is epoch/invalid but start_at + stored duration_days exist on the order,
 * recover end = start + duration_days (order commercial window — not catalog SKU invent).
 */
export function resolveBoostStoredPeriodBounds(input: {
  startAt: string | null | undefined;
  endAt: string | null | undefined;
  durationDays: number | null | undefined;
}): { startAt: string | null; endAt: string | null; recoveredEndFromDuration: boolean } {
  const start = parseAdsInstant(input.startAt);
  const end = parseAdsInstant(input.endAt);
  if (start && end) {
    return {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      recoveredEndFromDuration: false,
    };
  }
  const days = Math.trunc(Number(input.durationDays));
  if (start && !end && Number.isFinite(days) && days >= 1) {
    const recovered = new Date(start.getTime() + days * 86_400_000);
    return {
      startAt: start.toISOString(),
      endAt: recovered.toISOString(),
      recoveredEndFromDuration: true,
    };
  }
  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
    recoveredEndFromDuration: false,
  };
}

function formatDurationParts(ms: number, ko: boolean): string {
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) {
    return tx(ko, "admin_ads_exposure_duration_days_hours", { days: String(days), hours: String(hours) });
  }
  if (days > 0) return tx(ko, "admin_ads_exposure_duration_days", { days: String(days) });
  if (hours > 0) return tx(ko, "admin_ads_exposure_duration_hours", { hours: String(hours) });
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return tx(ko, "admin_ads_exposure_duration_minutes", { mins: String(mins) });
}

export type AdsRemainingKind = "until_start" | "until_end" | "ended" | "missing" | "error";

export function formatAdsRemaining(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
  nowMs: number,
  ko: boolean
): { label: string; kind: AdsRemainingKind } {
  const s = parseAdsInstant(start);
  const e = parseAdsInstant(end);
  if (!s && !e) return { label: ko ? "—" : "—", kind: "missing" };
  if (!s || !e) {
    return {
      label: tx(ko, "admin_ads_exposure_period_data_error"),
      kind: "error",
    };
  }
  if (s.getTime() > nowMs) {
    return {
      label: tx(ko, "admin_ads_exposure_until_start", { duration: formatDurationParts(s.getTime() - nowMs, ko) }),
      kind: "until_start",
    };
  }
  if (nowMs < e.getTime()) {
    return {
      label: tx(ko, "admin_ads_exposure_until_end", { duration: formatDurationParts(e.getTime() - nowMs, ko) }),
      kind: "until_end",
    };
  }
  return { label: tx(ko, "admin_ads_exposure_ended_state"), kind: "ended" };
}

export function formatPreApprovalRuntimeStatus(ko: boolean): string {
  return tx(ko, "admin_ads_exposure_pre_approval");
}

export function formatRequestedPlacement(input: {
  kind: AdsPlacementProductKind;
  ko: boolean;
  inventoryKey?: string | null;
  feedDomain?: "trade" | "community" | string | null;
  popupSurface?: string | null;
}): string {
  const { kind, ko } = input;
  // 재감사 R3 (A-5): 지면 이름은 `human-placement-label` 한 곳에서
  if (kind === "community_boost") return humanPlacementLabel("community_top_pin", ko);
  if (kind === "trade_boost") return humanPlacementLabel("feed_boost", ko);
  if (kind === "delivery_sponsored") return humanPlacementLabel("STORES_LIST_PROMOTE", ko);
  if (kind === "feed_banner") {
    const key = String(input.inventoryKey ?? "").trim().split(/\s+/)[0] ?? "";
    if (key && /^(TRADE_HOME|TRADE_CATEGORY|COMMUNITY_HOME|COMMUNITY_TOPIC)$/i.test(key)) {
      return humanPlacementLabel(key, ko);
    }
    const domain = String(input.feedDomain ?? "").toLowerCase();
    return humanPlacementLabel(domain.includes("community") || /community/i.test(key) ? "COMMUNITY_HOME" : "TRADE_HOME", ko);
  }
  if (kind === "delivery_banner") {
    // Requested: never invent Slot N
    const key = String(input.inventoryKey ?? "STORES_HOME_HERO").trim();
    return humanPlacementLabel(key || "STORES_HOME_HERO", ko);
  }
  // popup
  const surface = humanPopupSurfaceShortLabel(input.popupSurface || "GLOBAL", ko);
  return tx(ko, "admin_ads_exposure_surface_popup", { surface: String(surface) });
}

export function formatActualPlacement(input: {
  kind: AdsPlacementProductKind;
  ko: boolean;
  inventoryKey?: string | null;
  feedDomain?: "trade" | "community" | string | null;
  popupSurface?: string | null;
  /** 1-based slide; omit when not assigned */
  slotIndex?: number | null;
}): string {
  if (input.kind === "delivery_banner") {
    const key = String(input.inventoryKey ?? "").trim().split(/\s+/)[0] ?? "";
    if (!key) {
      return tx(input.ko, "admin_ads_exposure_not_assigned_yet");
    }
    const base = humanPlacementLabel(key || "STORES_HOME_HERO", input.ko);
    const slot = input.slotIndex;
    if (slot != null && Number.isFinite(slot) && slot > 0) {
      return koPart(base, `Slide ${Math.floor(slot)}`, input.ko);
    }
    return base;
  }
  const base = formatRequestedPlacement(input);
  return base;
}

function koPart(base: string, suffix: string, ko: boolean): string {
  void ko;
  return `${base} > ${suffix}`;
}

export function inferPlacementProductKind(domain: string, product: string): AdsPlacementProductKind {
  const d = String(domain ?? "").toLowerCase();
  const p = String(product ?? "").toLowerCase();
  if (d.includes("community") && (d.includes("promote") || p.includes("promote") || p.includes("boost"))) {
    return "community_boost";
  }
  if (d.includes("trade") && (d.includes("promote") || p.includes("promote") || p.includes("boost"))) {
    return "trade_boost";
  }
  if (p.includes("sponsored") || p.includes("store_promote")) return "delivery_sponsored";
  if (d === "popup" || p.includes("popup")) return "popup";
  if (d === "feed" || (p.includes("feed") && p.includes("banner"))) return "feed_banner";
  return "delivery_banner";
}

export function formatPlacementByMode(
  mode: AdsPlacementMode,
  input: Parameters<typeof formatActualPlacement>[0]
): string {
  if (mode === "requested") {
    return formatRequestedPlacement(input);
  }
  return formatActualPlacement(input);
}
