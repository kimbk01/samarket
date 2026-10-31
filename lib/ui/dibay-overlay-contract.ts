/**
 * DIBAY Overlay Design System v1.0.0 — contract SSOT.
 * Visual tokens: `app/dibay-overlay.css` (`--overlay-*`).
 * Geometry: 바텀시트는 전부 기기 하단(`bottom: 0`) · safe-bottom 은 패널 안 1회 (Owner 2026-11-01).
 *   z 는 `lib/main-menu/bottom-nav-config.ts` (`MAIN_BOTTOM_NAV_SHEET_Z_CLASS`).
 * Action roles map to Sam.btn semantic vocabulary.
 */

import {
  MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS,
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";

export const DIBAY_OVERLAY_SYSTEM_VERSION = "1.0.0" as const;

/** Attachment SSOT colors — overlay scope only (do not invent alternate hex). */
export const OVERLAY_COLOR = {
  primary: "#085C3F",
  primaryDark: "#084732",
  secondary: "#F5F7F6",
  textPrimary: "#111111",
  textSecondary: "#666666",
  border: "#E5E7E8",
  danger: "#E53935",
  surface: "#FFFFFF",
  backdrop: "rgba(0, 0, 0, 0.5)",
} as const;

export const OVERLAY_RADIUS_PX = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const OVERLAY_TYPE = {
  title1: { sizePx: 20, weight: 700, lineHeight: 1.4 },
  title2: { sizePx: 18, weight: 600, lineHeight: 1.4 },
  body1: { sizePx: 16, weight: 400, lineHeight: 1.6 },
  body2: { sizePx: 14, weight: 400, lineHeight: 1.6 },
  caption: { sizePx: 12, weight: 400, lineHeight: 1.4 },
} as const;

export const OVERLAY_SPACE_PX = [8, 12, 16, 20, 24, 32] as const;

export const OVERLAY_MOTION_MS = {
  enter: 200,
  exit: 180,
  press: 100,
} as const;

/** Press feedback — attachment: scale 98%. */
export const OVERLAY_PRESS_SCALE = 0.98 as const;

export const OVERLAY_BACKDROP_BLUR_PX = 4 as const;

export type DibayOverlayActionRole = "primary" | "secondary" | "destructive" | "text";

export type DibayOverlayPlacement = "center" | "bottom-sheet" | "full-sheet";

export type DibayOverlayZRole = "sheet" | "nested" | "dialog";

export const OVERLAY_Z_CLASS: Record<DibayOverlayZRole, string> = {
  sheet: MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
  nested: MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS,
  /** Center dialogs share sheet stacking (above nav FAB/call). */
  dialog: MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
};

/**
 * 바텀시트 위치 기준 (Owner 2026-11-01): 모든 사용자 바텀시트는 기기 맨 아래(`bottom: 0`)에서 열리고
 * 하단 탭을 덮는다. 「하단 탭 위」 배치(`above-bottom-nav`)는 폐지 — 시트 아래 빈 띠가 생긴다.
 * safe-bottom 은 패널 안쪽 padding 으로 **한 번만** (`.dibay-overlay-sheet`, `app/dibay-overlay.css`).
 * 키보드 열림 = visualViewport 밴드 규칙(KB-02/05) 그대로.
 */
export const OVERLAY_SHEET_MAX_H_CLASS = "max-h-[min(82dvh,560px)]" as const;

/** CSS class vocabulary — `app/dibay-overlay.css`. */
export const OverlayUi = {
  root: "dibay-overlay-root",
  backdrop: "dibay-overlay-backdrop",
  dialogPanel: "dibay-overlay-dialog",
  /** Scroll owner inside center dialog — keeps footer actions reachable. */
  dialogScroll: "dibay-overlay-dialog-scroll",
  sheetPanel: "dibay-overlay-sheet",
  sheetHandle: "dibay-overlay-sheet__handle",
  fullSheet: "dibay-overlay-full-sheet",
  title: "dibay-overlay-title",
  titleSheet: "dibay-overlay-title--sheet",
  body: "dibay-overlay-body",
  bodySecondary: "dibay-overlay-body--secondary",
  caption: "dibay-overlay-caption",
  actionsRow: "dibay-overlay-actions dibay-overlay-actions--row",
  actionsStack: "dibay-overlay-actions dibay-overlay-actions--stack",
  btn: {
    base: "dibay-overlay-btn",
    primary: "dibay-overlay-btn dibay-overlay-btn--primary",
    secondary: "dibay-overlay-btn dibay-overlay-btn--secondary",
    secondaryDanger: "dibay-overlay-btn dibay-overlay-btn--secondary dibay-overlay-btn--danger-text",
    destructive: "dibay-overlay-btn dibay-overlay-btn--destructive",
    text: "dibay-overlay-btn dibay-overlay-btn--text",
  },
  actionSheetList: "dibay-overlay-action-list",
  actionSheetItem: "dibay-overlay-action-item",
  actionSheetItemDanger: "dibay-overlay-action-item dibay-overlay-action-item--danger",
  /** 시트 안 작은 글자 행동 — 44px 터치 · 눌림 효과 */
  textAction: "dibay-overlay-text-action",
  textActionMuted: "dibay-overlay-text-action dibay-overlay-text-action--muted",
  profileHeader: "dibay-overlay-profile-header",
  input: "dibay-overlay-input",
} as const;

export const DIBAY_OVERLAY_HARD_LOCK = {
  mustUseOverlaySsot: true,
  featureLocalModalVisualSystemsProhibited: true,
  appOwnedWindowAlertConfirmPromptProhibited: true,
  /** Owner 2026-11-01 — 바텀시트는 기기 하단(`bottom: 0`) · safe 패널 안 1회 (탭 위 배치 폐지) */
  bottomSheetsMustStartAtDeviceBottom: true,
  overlayActionsMustUseOverlayBtnRoles: true,
  osOwnedPromptsRemainNative: true,
  forbiddenCallConfirmHex: "#007AFF",
} as const;
