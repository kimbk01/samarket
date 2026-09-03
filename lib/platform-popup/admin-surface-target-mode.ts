/**
 * Admin/Owner single target-mode radio ↔ campaign_surfaces rows.
 * UI: GLOBAL | COMMUNITY | TRADE | DELIVERY | DELIVERY_OWNER | ADMIN | MYPAGE
 * DB: one canonical surface row (GLOBAL expands at resolve time).
 */

import {
  PLATFORM_POPUP_TARGET_SURFACES,
  type PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

function isPlatformPopupTargetSurface(value: string): value is PlatformPopupTargetSurface {
  const v = value === "OWNER_OPS" ? "DELIVERY_OWNER" : value;
  return (PLATFORM_POPUP_TARGET_SURFACES as readonly string[]).includes(v);
}

export const PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS = [
  {
    mode: "GLOBAL",
    labelKo: "전체",
    labelEn: "All",
    helpKo: "커뮤니티 · 거래 · 배달 · 배달 오너 · 어드민 · 내정보에 동일 팝업이 노출됩니다.",
    helpEn: "Same popup on Community, Trade, Delivery, Delivery Owner, Admin, and My Page.",
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
    helpKo: "배달(소비자) 영역에만 노출됩니다.",
    helpEn: "Shown on consumer Delivery only.",
  },
  {
    mode: "DELIVERY_OWNER",
    labelKo: "배달 오너",
    labelEn: "Delivery Owner",
    helpKo: "배달 오너 운영 화면에만 노출됩니다. 금융·정산·결제 확정 화면은 자동 제외됩니다.",
    helpEn: "Delivery Owner ops only. Finance, settlement, and payment confirmation stay excluded.",
  },
  {
    mode: "ADMIN",
    labelKo: "어드민",
    labelEn: "Admin",
    helpKo: "어드민 일반 화면에만 노출됩니다. 금융·승인·위험 확인 화면은 자동 제외됩니다.",
    helpEn: "Admin general screens only. Finance, approval, and danger confirms stay excluded.",
  },
  {
    mode: "MYPAGE",
    labelKo: "내정보",
    labelEn: "My Page",
    helpKo: "내정보 영역에만 노출됩니다.",
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
  const normalized = mode === ("OWNER_OPS" as PlatformPopupAdminSurfaceMode) ? "DELIVERY_OWNER" : mode;
  if (!isPlatformPopupTargetSurface(normalized)) return ["GLOBAL"];
  return [normalized];
}

/**
 * Hydrate radio from DB rows.
 * GLOBAL wins if present. Else first valid target. Empty → GLOBAL.
 * Legacy OWNER_OPS → DELIVERY_OWNER.
 */
export function adminTargetModeFromSurfaces(
  surfaces: readonly string[] | null | undefined
): PlatformPopupAdminSurfaceMode {
  const list = (surfaces ?? [])
    .map((s) => {
      const u = String(s).trim().toUpperCase();
      return u === "OWNER_OPS" ? "DELIVERY_OWNER" : u;
    })
    .filter((s): s is PlatformPopupTargetSurface => isPlatformPopupTargetSurface(s));
  if (list.length === 0) return "GLOBAL";
  if (list.includes("GLOBAL")) return "GLOBAL";
  return list[0] ?? "GLOBAL";
}

export function adminSurfaceModeLabel(
  mode: PlatformPopupAdminSurfaceMode,
  lang: "ko" | "en"
): string {
  const normalized =
    (mode as string) === "OWNER_OPS" ? "DELIVERY_OWNER" : mode;
  const opt = PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.find((o) => o.mode === normalized);
  if (!opt) return normalized;
  return lang === "en" ? opt.labelEn : opt.labelKo;
}
