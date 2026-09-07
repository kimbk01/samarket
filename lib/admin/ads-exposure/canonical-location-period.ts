/**
 * Canonical Ads location / period / remaining formatter SSOT.
 * OWNER LOCK: FINAL LOCATION/PERIOD + PLACEMENT SEMANTICS.
 * Do NOT invent per-screen date/placement formatters.
 */

import {
  humanPlacementLabel,
  humanPopupSurfaceShortLabel,
} from "@/lib/admin/ads-exposure/human-placement-label";

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
      label: ko ? "기간 정보 오류" : "Period data error",
      valid: false,
      error: true,
    };
  }
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${hh}:${mm}`;
  };
  return { label: `${fmt(s)} ~ ${fmt(e)}`, valid: true, error: false };
}

function formatDurationParts(ms: number, ko: boolean): string {
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) {
    return ko ? `${days}일 ${hours}시간` : `${days}d ${hours}h`;
  }
  if (days > 0) return ko ? `${days}일` : `${days}d`;
  if (hours > 0) return ko ? `${hours}시간` : `${hours}h`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return ko ? `${mins}분` : `${mins}m`;
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
      label: ko ? "기간 정보 오류" : "Period data error",
      kind: "error",
    };
  }
  if (s.getTime() > nowMs) {
    return {
      label: ko
        ? `시작까지 ${formatDurationParts(s.getTime() - nowMs, true)}`
        : `${formatDurationParts(s.getTime() - nowMs, false)} until start`,
      kind: "until_start",
    };
  }
  if (nowMs < e.getTime()) {
    return {
      label: ko
        ? `종료까지 ${formatDurationParts(e.getTime() - nowMs, true)}`
        : `${formatDurationParts(e.getTime() - nowMs, false)} until end`,
      kind: "until_end",
    };
  }
  return { label: ko ? "종료됨" : "Ended", kind: "ended" };
}

export function formatPreApprovalRuntimeStatus(ko: boolean): string {
  return ko ? "승인 전" : "Pre-approval";
}

export function formatRequestedPlacement(input: {
  kind: AdsPlacementProductKind;
  ko: boolean;
  inventoryKey?: string | null;
  feedDomain?: "trade" | "community" | string | null;
  popupSurface?: string | null;
}): string {
  const { kind, ko } = input;
  if (kind === "community_boost") {
    return ko ? "Community > 게시물 상위노출" : "Community > Post top exposure";
  }
  if (kind === "trade_boost") {
    return ko ? "거래 > 게시물 상위노출" : "Trade > Post top exposure";
  }
  if (kind === "delivery_sponsored") {
    return ko ? "배달 > 매장 리스트 > 상위홍보" : "Delivery > Store list > Promote";
  }
  if (kind === "feed_banner") {
    const domain = String(input.feedDomain ?? "").toLowerCase();
    const head =
      domain.includes("community")
        ? "Community"
        : ko
          ? "거래"
          : "Trade";
    return `${head} > Feed > Banner`;
  }
  if (kind === "delivery_banner") {
    // Requested: never invent Slot N
    const key = String(input.inventoryKey ?? "STORES_HOME_HERO").trim();
    return humanPlacementLabel(key || "STORES_HOME_HERO", ko);
  }
  // popup
  const surface = humanPopupSurfaceShortLabel(input.popupSurface || "GLOBAL", ko);
  return ko ? `${surface} > Popup` : `${surface} > Popup`;
}

export function formatActualPlacement(input: {
  kind: AdsPlacementProductKind;
  ko: boolean;
  inventoryKey?: string | null;
  feedDomain?: "trade" | "community" | string | null;
  popupSurface?: string | null;
  /** 1-based slot; omit when not assigned */
  slotIndex?: number | null;
}): string {
  const base = formatRequestedPlacement(input);
  if (input.kind === "delivery_banner") {
    const slot = input.slotIndex;
    if (slot != null && Number.isFinite(slot) && slot > 0) {
      return koPart(base, `Slot ${Math.floor(slot)}`, input.ko);
    }
  }
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
