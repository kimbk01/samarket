/**
 * Admin/Owner placement selection ↔ campaign_surfaces rows.
 *
 * UI:
 * - GLOBAL (전체) = exclusive — expands at resolve to all six consumer surfaces
 * - COMMUNITY | TRADE | DELIVERY | DELIVERY_OWNER | ADMIN | MYPAGE = multi-select
 *
 * DB: one GLOBAL row OR one+ domain rows (never GLOBAL mixed with domains).
 */

import {
  PLATFORM_POPUP_CONSUMER_SURFACES,
  PLATFORM_POPUP_TARGET_SURFACES,
  type PlatformPopupConsumerSurface,
  type PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

function isPlatformPopupTargetSurface(value: string): value is PlatformPopupTargetSurface {
  const v = value === "OWNER_OPS" ? "DELIVERY_OWNER" : value;
  return (PLATFORM_POPUP_TARGET_SURFACES as readonly string[]).includes(v);
}

function isConsumerSurface(value: string): value is PlatformPopupConsumerSurface {
  return (PLATFORM_POPUP_CONSUMER_SURFACES as readonly string[]).includes(value);
}

/** Canonical path examples — must match resolveDibaySurface. */
export const PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS = [
  {
    mode: "GLOBAL",
    labelKo: "전체 — 커뮤니티·거래·배달·배달 오너·어드민·내정보",
    labelEn: "All — Community, Trade, Delivery, Delivery Owner, Admin, My Page",
    helpKo: "위 여섯 영역에 동일 팝업 1개가 노출됩니다. 결제·통화·위험 작업 화면은 시스템이 잠시 가립니다.",
    helpEn: "One popup on those six areas. Payment, call, and high-risk screens are gated automatically.",
    pagesKo: "여섯 영역 전체",
    pagesEn: "All six areas",
  },
  {
    mode: "COMMUNITY",
    labelKo: "커뮤니티",
    labelEn: "Community",
    helpKo: "커뮤니티 영역에 노출됩니다. 다른 영역과 함께 선택할 수 있습니다.",
    helpEn: "Community area. Can be combined with other areas.",
    pagesKo: "/philife · /community",
    pagesEn: "/philife · /community",
  },
  {
    mode: "TRADE",
    labelKo: "거래",
    labelEn: "Trade",
    helpKo: "거래 영역에 노출됩니다. 다른 영역과 함께 선택할 수 있습니다.",
    helpEn: "Trade area. Can be combined with other areas.",
    pagesKo: "/market · /post · /write",
    pagesEn: "/market · /post · /write",
  },
  {
    mode: "DELIVERY",
    labelKo: "배달",
    labelEn: "Delivery",
    helpKo: "배달(소비자) 영역에 노출됩니다. 다른 영역과 함께 선택할 수 있습니다.",
    helpEn: "Consumer Delivery. Can be combined with other areas.",
    pagesKo: "/stores · /delivery · /shop",
    pagesEn: "/stores · /delivery · /shop",
  },
  {
    mode: "DELIVERY_OWNER",
    labelKo: "배달 오너",
    labelEn: "Delivery Owner",
    helpKo: "배달 오너 화면에 노출됩니다. 결제·정산·위험 작업 화면은 시스템이 잠시 가립니다.",
    helpEn: "Delivery Owner screens. Payment, settlement, and high-risk flows are gated automatically.",
    pagesKo: "/stores/owner · /my/business",
    pagesEn: "/stores/owner · /my/business",
  },
  {
    mode: "ADMIN",
    labelKo: "어드민",
    labelEn: "Admin",
    helpKo: "어드민 화면에 노출됩니다. 결제·승인·위험 확인 화면은 시스템이 잠시 가립니다.",
    helpEn: "Admin screens. Payment, approval, and danger confirms are gated automatically.",
    pagesKo: "/admin (결제·정산 경로 제외)",
    pagesEn: "/admin (except finance/settlement paths)",
  },
  {
    mode: "MYPAGE",
    labelKo: "내정보",
    labelEn: "My Page",
    helpKo: "내정보 영역에 노출됩니다. 다른 영역과 함께 선택할 수 있습니다.",
    helpEn: "My Page area. Can be combined with other areas.",
    pagesKo: "/mypage · /my",
    pagesEn: "/mypage · /my",
  },
] as const satisfies ReadonlyArray<{
  mode: PlatformPopupTargetSurface;
  labelKo: string;
  labelEn: string;
  helpKo: string;
  helpEn: string;
  pagesKo: string;
  pagesEn: string;
}>;

export type PlatformPopupAdminSurfaceMode = PlatformPopupTargetSurface;

const DOMAIN_ORDER = PLATFORM_POPUP_CONSUMER_SURFACES;

/**
 * Normalize selection for Save / hydrate.
 * GLOBAL exclusive; empty → GLOBAL; OWNER_OPS → DELIVERY_OWNER; stable domain order.
 */
export function normalizeAdminSurfaceSelection(
  raw: readonly string[] | null | undefined
): PlatformPopupTargetSurface[] {
  const list = (raw ?? [])
    .map((s) => {
      const u = String(s).trim().toUpperCase();
      return u === "OWNER_OPS" ? "DELIVERY_OWNER" : u;
    })
    .filter((s): s is PlatformPopupTargetSurface => isPlatformPopupTargetSurface(s));

  if (list.length === 0) return ["GLOBAL"];
  if (list.includes("GLOBAL")) return ["GLOBAL"];

  const domains = DOMAIN_ORDER.filter((d) => list.includes(d));
  return domains.length > 0 ? [...domains] : ["GLOBAL"];
}

/** Toggle GLOBAL (exclusive) or a domain checkbox. Always returns a non-empty selection. */
export function toggleAdminSurfaceSelection(
  current: readonly PlatformPopupTargetSurface[],
  mode: PlatformPopupTargetSurface,
  nextChecked: boolean
): PlatformPopupTargetSurface[] {
  const cur = normalizeAdminSurfaceSelection(current);

  if (mode === "GLOBAL") {
    return ["GLOBAL"];
  }

  if (!isConsumerSurface(mode)) return cur;

  const domains = cur.includes("GLOBAL") ? ([] as PlatformPopupConsumerSurface[]) : cur.filter(isConsumerSurface);

  let next: PlatformPopupConsumerSurface[];
  if (nextChecked) {
    next = domains.includes(mode) ? domains : [...domains, mode];
  } else {
    next = domains.filter((d) => d !== mode);
  }

  return normalizeAdminSurfaceSelection(next);
}

export function isAdminSurfaceSelected(
  selected: readonly PlatformPopupTargetSurface[],
  mode: PlatformPopupTargetSurface
): boolean {
  const cur = normalizeAdminSurfaceSelection(selected);
  if (mode === "GLOBAL") return cur.includes("GLOBAL");
  return !cur.includes("GLOBAL") && cur.includes(mode);
}

/** Save payload from multi-select (or legacy single mode). */
export function surfacesFromAdminSelection(
  selected: readonly PlatformPopupTargetSurface[]
): PlatformPopupTargetSurface[] {
  return normalizeAdminSurfaceSelection(selected);
}

/** @deprecated Prefer surfacesFromAdminSelection — kept for single-mode callers/tests. */
export function surfacesFromAdminTargetMode(
  mode: PlatformPopupAdminSurfaceMode
): PlatformPopupTargetSurface[] {
  return normalizeAdminSurfaceSelection([mode]);
}

/**
 * Hydrate selection from DB rows.
 * GLOBAL wins if present. Else all valid domain rows. Empty → GLOBAL.
 */
export function adminSurfacesFromDb(
  surfaces: readonly string[] | null | undefined
): PlatformPopupTargetSurface[] {
  return normalizeAdminSurfaceSelection(surfaces);
}

/**
 * Legacy single-mode hydrate (first domain when multi). Prefer adminSurfacesFromDb.
 */
export function adminTargetModeFromSurfaces(
  surfaces: readonly string[] | null | undefined
): PlatformPopupAdminSurfaceMode {
  const list = normalizeAdminSurfaceSelection(surfaces);
  return list[0] ?? "GLOBAL";
}

/** Preview frame surface: GLOBAL → TRADE tone; else first selected domain. */
export function previewSurfaceFromAdminSelection(
  selected: readonly PlatformPopupTargetSurface[]
): PlatformPopupTargetSurface {
  const list = normalizeAdminSurfaceSelection(selected);
  if (list.includes("GLOBAL")) return "TRADE";
  return list[0] ?? "TRADE";
}

export function adminSurfaceModeLabel(
  mode: PlatformPopupAdminSurfaceMode,
  lang: "ko" | "en"
): string {
  const normalized = (mode as string) === "OWNER_OPS" ? "DELIVERY_OWNER" : mode;
  const opt = PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.find((o) => o.mode === normalized);
  if (!opt) return normalized;
  return lang === "en" ? opt.labelEn : opt.labelKo;
}

/** List/hub label for one or many surfaces. */
export function adminSurfacesSelectionLabel(
  surfaces: readonly string[] | null | undefined,
  lang: "ko" | "en"
): string {
  const list = normalizeAdminSurfaceSelection(surfaces);
  if (list.includes("GLOBAL")) return adminSurfaceModeLabel("GLOBAL", lang);
  return list.map((m) => adminSurfaceModeLabel(m, lang)).join(lang === "en" ? " · " : " · ");
}
