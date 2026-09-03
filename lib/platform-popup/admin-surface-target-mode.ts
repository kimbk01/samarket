/**
 * CUT 5-R — Admin single target-mode radio ↔ campaign_surfaces rows.
 * UI: one of GLOBAL | COMMUNITY | TRADE | DELIVERY | MYPAGE
 * DB: one canonical surface row (GLOBAL expands at resolve time).
 */

import {
  PLATFORM_POPUP_TARGET_SURFACES,
  type PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

function isPlatformPopupTargetSurface(value: string): value is PlatformPopupTargetSurface {
  return (PLATFORM_POPUP_TARGET_SURFACES as readonly string[]).includes(value);
}

export const PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS = [
  {
    mode: "GLOBAL",
    labelKo: "전체",
    labelEn: "All",
    helpKo: "커뮤니티 · 거래 · 배달 · 마이페이지에 노출됩니다.",
    helpEn: "Shown on Community, Trade, Delivery, and My Page.",
  },
  {
    mode: "COMMUNITY",
    labelKo: "커뮤니티",
    labelEn: "Community",
    helpKo: "커뮤니티 영역에만 노출됩니다.",
    helpEn: "Shown on Community only.",
  },
  {
    mode: "TRADE",
    labelKo: "거래",
    labelEn: "Trade",
    helpKo: "거래 영역에만 노출됩니다.",
    helpEn: "Shown on Trade only.",
  },
  {
    mode: "DELIVERY",
    labelKo: "배달",
    labelEn: "Delivery",
    helpKo: "배달 영역에만 노출됩니다.",
    helpEn: "Shown on Delivery only.",
  },
  {
    mode: "MYPAGE",
    labelKo: "마이페이지",
    labelEn: "My Page",
    helpKo: "마이페이지 영역에만 노출됩니다.",
    helpEn: "Shown on My Page only.",
  },
] as const satisfies ReadonlyArray<{
  mode: PlatformPopupTargetSurface;
  labelKo: string;
  labelEn: string;
  helpKo: string;
  helpEn: string;
}>;

export type PlatformPopupAdminSurfaceMode = PlatformPopupTargetSurface;

/** Radio selection → single-row surfaces array for Save. */
export function surfacesFromAdminTargetMode(
  mode: PlatformPopupAdminSurfaceMode
): PlatformPopupTargetSurface[] {
  if (!isPlatformPopupTargetSurface(mode)) return ["GLOBAL"];
  return [mode];
}

/**
 * Hydrate radio from DB rows.
 * GLOBAL wins if present. Else first valid target. Empty → GLOBAL.
 * Legacy multi-domain without GLOBAL collapses to first domain for single-mode UX.
 */
export function adminTargetModeFromSurfaces(
  surfaces: readonly string[] | null | undefined
): PlatformPopupAdminSurfaceMode {
  const list = (surfaces ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s): s is PlatformPopupTargetSurface => isPlatformPopupTargetSurface(s));
  if (list.length === 0) return "GLOBAL";
  if (list.includes("GLOBAL")) return "GLOBAL";
  return list[0] ?? "GLOBAL";
}

export function adminSurfaceModeLabel(
  mode: PlatformPopupAdminSurfaceMode,
  lang: "ko" | "en"
): string {
  const opt = PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.find((o) => o.mode === mode);
  if (!opt) return mode;
  return lang === "en" ? opt.labelEn : opt.labelKo;
}
