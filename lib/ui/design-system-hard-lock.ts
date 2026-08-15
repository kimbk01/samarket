/**
 * Slice 2.5 Design System + Accessibility HARD LOCK — contract SSOT.
 *
 * Visual tokens live in `app/design-tokens.css` (`--sam-*` / `--dibay-*`).
 * Component class strings: `lib/ui/sam-component-classes.ts` → `Sam`.
 * Motion durations: `lib/mypage/mypage-authority-contract.ts` → `MYPAGE_MOTION_MS`.
 *
 * DO NOT: redesign MyPage IA (Slice 3); invent orange/Karrot brand; dual token trees.
 */

import { MYPAGE_MOTION_MS } from "@/lib/mypage/mypage-authority-contract";

/** Brand — DIBAY green (Starbucks-class). Karrot orange forbidden. */
export const DESIGN_SYSTEM_BRAND = {
  primaryToken: "--dibay-green",
  primaryHex: "#0B421A",
  creamToken: "--dibay-cream",
  creamHex: "#FFFCFC",
  forbiddenBrandNotes: ["karrot-orange", "당근 주황"] as const,
} as const;

/** CSS variable names that must remain the color SSOT. */
export const DESIGN_SYSTEM_COLOR_TOKENS = [
  "--sam-primary",
  "--sam-bg-app",
  "--sam-bg-surface",
  "--sam-text-primary",
  "--sam-border-default",
  "--sam-danger",
  "--sam-success",
] as const;

/** Typography token names (sizes in design-tokens.css). */
export const DESIGN_SYSTEM_TYPE_TOKENS = [
  "--sam-text-page-title-size",
  "--sam-text-body-size",
  "--sam-text-helper-size",
  "--sm-font-input",
] as const;

/** Radius / elevation / spacing SSOT names. */
export const DESIGN_SYSTEM_LAYOUT_TOKENS = {
  radiusRect: "--sam-radius-sm",
  radiusPill: "--sam-radius-pill",
  shadowElevated: "--sam-shadow-elevated",
  spaceScale: [
    "--sam-space-1",
    "--sam-space-2",
    "--sam-space-3",
    "--sam-space-4",
    "--sam-space-5",
    "--sam-space-6",
  ] as const,
  tapMin: "--sam-tap-min",
} as const;

/** Sam component class prefixes that remain the product UI vocabulary. */
export const DESIGN_SYSTEM_COMPONENT_CLASSES = {
  btnPrimary: "sam-btn-primary",
  btnDanger: "sam-btn-danger",
  btnSecondary: "sam-btn-secondary",
  card: "sam-card",
  input: "sam-input",
  listRow: "sam-list-row",
  formField: "sam-form-field",
  sheetPanel: "sam-sheet-panel",
} as const;

/**
 * Accessibility HARD LOCK — Windows / PWA / Native WebView 동일.
 */
export const DESIGN_SYSTEM_A11Y = {
  /** WCAG 2.1 AA normal text */
  contrastRatioMin: 4.5,
  /** WCAG 2.1 AA large text / UI components */
  contrastRatioUiMin: 3,
  /** Minimum touch / click target (px) — matches `--sam-tap-min` */
  touchTargetMinPx: 44,
  /** iOS WKWebView input zoom floor */
  inputFontMinPx: 16,
  focusVisibleRequired: true,
  reducedMotionMedia: "(prefers-reduced-motion: reduce)",
  /** When reduced motion: use shortened Motion Contract (Slice 2) */
  reducedMotionMs: {
    push: 0,
    back: 0,
    modal: 0,
    sheet: 0,
    toast: Math.min(120, MYPAGE_MOTION_MS.toast),
  },
  keyboardFocusOrder: "document",
  ariaLabelRequiredOnIconOnlyControls: true,
  screenReaderPrimarySurfaces: ["cta", "form", "modal"] as const,
} as const;

export const DESIGN_SYSTEM_FILE_SSOT = {
  tokensCss: "app/design-tokens.css",
  overlayCss: "app/dibay-overlay.css",
  overlayContract: "lib/ui/dibay-overlay-contract.ts",
  overlayComponents: "components/ui/dibay-overlay/",
  componentsCss: "app/samarket-components.css",
  samClasses: "lib/ui/sam-component-classes.ts",
  motion: "lib/mypage/mypage-authority-contract.ts",
  doc: "docs/customer-platform/04-DESIGN-SYSTEM.md",
  overlayInventory: "docs/ui/dibay-overlay-inventory.md",
} as const;

/**
 * DIBAY OVERLAY HARD LOCK — app-owned modal/sheet/confirm SSOT.
 */
export const DIBAY_OVERLAY_HARD_LOCK_RULES = [
  "NEW APP-OWNED OVERLAYS MUST USE DIBAY OVERLAY SSOT (components/ui/dibay-overlay)",
  "FEATURE-LOCAL MODAL VISUAL SYSTEMS ARE PROHIBITED",
  "APP-OWNED window.alert/confirm/prompt ARE PROHIBITED",
  "BOTTOM SHEETS ON NAV ROUTES MUST USE MAIN_BOTTOM_NAV_SHEET GEOMETRY",
  "OVERLAY ACTIONS MUST USE dibay-overlay-btn ROLES (primary/secondary/destructive/text)",
  "OS-OWNED PROMPTS MUST REMAIN NATIVE (CallKit, mic/cam, APNs, browser permission)",
  "FORBIDDEN CALL-CONFIRM HEX: #007AFF",
  "BACKDROP AUTHORITY: --overlay-backdrop + blur (app/dibay-overlay.css)",
] as const;
