/**
 * CUT 1 — Popup Presentation LOCK reopen (Owner Decision 1).
 * Interruptive presentations only for GlobalPopupHost.
 * Banner presentations are reserved — no interruptive mount.
 */

export const PLATFORM_POPUP_PRESENTATION_TYPES = [
  "center_modal",
  "bottom_sheet",
  "benefit_dialog",
  "inline_banner",
  "hero_banner",
  /** 비간섭 — 당겨서 새로고침 슬롯 띠 배너 (`lib/platform-popup/ptr-reveal-contract.ts`) */
  "ptr_reveal",
] as const;
export type PlatformPopupPresentationType = (typeof PLATFORM_POPUP_PRESENTATION_TYPES)[number];

/** Mounted by GlobalPopupHost / DibayPopupAd. */
export const PLATFORM_POPUP_INTERRUPTIVE_PRESENTATIONS = [
  "center_modal",
  "bottom_sheet",
  "benefit_dialog",
] as const;
export type PlatformPopupInterruptivePresentation =
  (typeof PLATFORM_POPUP_INTERRUPTIVE_PRESENTATIONS)[number];

/** `ptr_band` — PTR 띠 소재(휴대폰·태블릿 띠, 로고), ptr_reveal 전용 */
export const PLATFORM_POPUP_CREATIVE_MODES = ["card", "artwork", "ptr_band"] as const;
export type PlatformPopupCreativeMode = (typeof PLATFORM_POPUP_CREATIVE_MODES)[number];

export const PLATFORM_POPUP_FREQUENCY_MODES = [
  "once_per_session",
  "once_per_day",
  "once_campaign",
  "close_only",
] as const;
export type PlatformPopupFrequencyMode = (typeof PLATFORM_POPUP_FREQUENCY_MODES)[number];

export function isPlatformPopupPresentationType(
  value: string
): value is PlatformPopupPresentationType {
  return (PLATFORM_POPUP_PRESENTATION_TYPES as readonly string[]).includes(value);
}

export function isPlatformPopupInterruptivePresentation(
  value: string
): value is PlatformPopupInterruptivePresentation {
  return (PLATFORM_POPUP_INTERRUPTIVE_PRESENTATIONS as readonly string[]).includes(value);
}

/** 관리자 저장 허용 프레젠테이션 — 인터럽트 3종 + PTR 띠 배너 */
export function isPlatformPopupAdminSelectablePresentation(
  value: string
): value is PlatformPopupInterruptivePresentation | "ptr_reveal" {
  return isPlatformPopupInterruptivePresentation(value) || value === "ptr_reveal";
}

export function isPlatformPopupPtrRevealPresentation(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "ptr_reveal";
}

export function isPlatformPopupCreativeMode(value: string): value is PlatformPopupCreativeMode {
  return (PLATFORM_POPUP_CREATIVE_MODES as readonly string[]).includes(value);
}

export function isPlatformPopupFrequencyMode(value: string): value is PlatformPopupFrequencyMode {
  return (PLATFORM_POPUP_FREQUENCY_MODES as readonly string[]).includes(value);
}

export function normalizePlatformPopupPresentationType(
  value: string | null | undefined
): PlatformPopupPresentationType {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (isPlatformPopupPresentationType(v)) return v;
  return "bottom_sheet";
}

export function normalizePlatformPopupCreativeMode(
  value: string | null | undefined
): PlatformPopupCreativeMode {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (isPlatformPopupCreativeMode(v)) return v;
  return "card";
}

export function normalizePlatformPopupFrequencyMode(
  value: string | null | undefined
): PlatformPopupFrequencyMode {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (isPlatformPopupFrequencyMode(v)) return v;
  return "once_per_session";
}

/**
 * @deprecated Owner FINAL — suppress on DISMISS, not impression.
 * Use `frequencyModeToDismissSuppressMode` from `dismiss-ssot.ts`.
 * Kept as thin alias for call-site migration; returns null for close_only.
 */
export function frequencyModeToAutoSuppressMode(
  frequency: PlatformPopupFrequencyMode
): "SESSION" | "TODAY" | "CAMPAIGN" | null {
  switch (frequency) {
    case "once_per_session":
      return "SESSION";
    case "once_per_day":
      return "TODAY";
    case "once_campaign":
      return "CAMPAIGN";
    case "close_only":
      return null;
  }
}
