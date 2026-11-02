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

/**
 * Overlay colors — `app/dibay-overlay.css` `--overlay-*` 가 실제 값 (브랜드 기본 토큰 `--dibay-*`·`--sm-color-*`).
 * TS 는 같은 값을 적어 둔 것 — 화면에는 CSS 변수를 쓴다 (`var(--overlay-danger)` 등). hex 를 새로 만들지 않는다.
 * 팝업 SSOT T1 (2026-11-02): 예전 첨부 값 #085C3F / #E53935 는 CSS 토큰과 달라 정정.
 */
export const OVERLAY_COLOR = {
  primary: "#0B421A",
  /** `--sm-color-primary-active` = color-mix(#0B421A 78%, #000) */
  primaryDark: "color-mix(in srgb, #0B421A 78%, #000000)",
  secondary: "#F5F7F6",
  textPrimary: "#362415",
  textSecondary: "#604C4C",
  border: "#E5E7E8",
  danger: "#D45252",
  /** 위험 버튼 눌림 = `--overlay-danger-active` */
  dangerActive: "color-mix(in srgb, #D45252 82%, #000000)",
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
  /** 팝업 버튼 글자 (T1 · v1.0.0 14 → 15) */
  button: { sizePx: 15, weight: 600, lineHeight: 1.2 },
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
  /** 오류 글자 (빨강) — 색 유틸리티는 위 클래스에 져서 안 먹는다 */
  captionDanger: "dibay-overlay-caption dibay-overlay-caption--danger",
  bodyDanger: "dibay-overlay-body--danger",
  /** 경고 글자 (오류 아님) */
  captionWarning: "dibay-overlay-caption dibay-overlay-caption--warning",
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
  /** 칩 — 선택됨은 `aria-pressed` / `aria-checked` / `data-selected="true"` */
  chip: "dibay-overlay-chip",
  /** 선택 카드 (요금제·사유·상품) — 선택됨 표시는 칩과 같은 속성 */
  selectCard: "dibay-overlay-select-card",
  /** 팝오버 메뉴 겉모양 — 위치 계산은 각 화면 유지 */
  popover: "dibay-overlay-popover",
  popoverItem: "dibay-overlay-popover__item",
  popoverItemDanger: "dibay-overlay-popover__item dibay-overlay-popover__item--danger",
  /** 상단 알림 배너 (통화 배너 제외) */
  banner: "dibay-overlay-banner",
  bannerTitle: "dibay-overlay-banner__title",
  bannerBody: "dibay-overlay-banner__body",
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
