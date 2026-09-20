/**
 * Presentation COMPOSITION ≠ DB presentation_type alone.
 * Maps interruptive presentation + creative mode → Type A / B / C / D.
 *
 * Shared SSOT remains campaign/creative/frequency/destination.
 * Geometry + DOM composition diverge by kind.
 * Type E FULL_SCREEN_EVENT is a destination page — not mapped here.
 */

import {
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupPresentationType,
  type PlatformPopupCreativeMode,
  type PlatformPopupInterruptivePresentation,
  type PlatformPopupPresentationType,
} from "@/lib/platform-popup/presentation-contract";

/** Owner visual compositions (interruptive overlay only). */
export const PLATFORM_POPUP_COMPOSITIONS = [
  "artwork_modal",
  "promotion_card_modal",
  "bottom_promotion_sheet",
  "benefit_dialog",
] as const;
export type PlatformPopupComposition = (typeof PLATFORM_POPUP_COMPOSITIONS)[number];

export function resolvePlatformPopupComposition(input: {
  presentationType?: string | null;
  creativeMode?: string | null;
}): PlatformPopupComposition {
  const presentation = normalizePlatformPopupPresentationType(input.presentationType);
  const creative = normalizePlatformPopupCreativeMode(input.creativeMode);

  if (presentation === "benefit_dialog") return "benefit_dialog";
  if (presentation === "bottom_sheet") return "bottom_promotion_sheet";
  if (creative === "artwork") return "artwork_modal";
  return "promotion_card_modal";
}

export function compositionUsesFloatingClose(kind: PlatformPopupComposition): boolean {
  return (
    kind === "artwork_modal" ||
    kind === "promotion_card_modal" ||
    kind === "bottom_promotion_sheet" ||
    kind === "benefit_dialog"
  );
}

export function compositionIsSheet(kind: PlatformPopupComposition): boolean {
  return kind === "bottom_promotion_sheet";
}

export function interruptivePresentationForComposition(
  kind: PlatformPopupComposition
): PlatformPopupInterruptivePresentation {
  if (kind === "bottom_promotion_sheet") return "bottom_sheet";
  if (kind === "benefit_dialog") return "benefit_dialog";
  return "center_modal";
}

export function creativeModeForComposition(kind: PlatformPopupComposition): PlatformPopupCreativeMode {
  return kind === "artwork_modal" ? "artwork" : "card";
}

/** Admin / docs — human labels (not UI output; UI uses i18n). */
export function compositionContractNote(kind: PlatformPopupComposition): {
  titleKo: string;
  titleEn: string;
  bodyKo: string;
  bodyEn: string;
} {
  switch (kind) {
    case "artwork_modal":
      return {
        titleKo: "Artwork",
        titleEn: "Artwork",
        bodyKo: "투명 PNG · 캐릭터/상품 강조 · 카드 위로 overflow",
        bodyEn: "Transparent PNG · character/product emphasis · overflow above card",
      };
    case "promotion_card_modal":
      return {
        titleKo: "Promotion Card",
        titleEn: "Promotion Card",
        bodyKo: "이미지 + 설명 + CTA가 하나의 카드",
        bodyEn: "Image + copy + CTA as one card",
      };
    case "bottom_promotion_sheet":
      return {
        titleKo: "Bottom Sheet",
        titleEn: "Bottom Sheet",
        bodyKo: "하단 프로모션 · floating X · footer 없음",
        bodyEn: "Bottom promotion · floating X · no footer",
      };
    case "benefit_dialog":
      return {
        titleKo: "Benefit Dialog",
        titleEn: "Benefit Dialog",
        bodyKo: "혜택 설명 · compact dialog · floating X",
        bodyEn: "Benefit explanation · compact dialog · floating X",
      };
  }
}

export function isInterruptivePresentationType(
  value: PlatformPopupPresentationType
): value is PlatformPopupInterruptivePresentation {
  return value === "center_modal" || value === "bottom_sheet" || value === "benefit_dialog";
}
